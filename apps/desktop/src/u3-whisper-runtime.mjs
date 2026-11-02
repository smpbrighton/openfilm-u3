/**
 * The installer's local ASR binary (no Electron imports). Mac arm64 and Windows x64 are published.
 * Build time uses gh for the private release; the installed app never downloads a binary.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const REPO = 'smpbrighton/openfilm-u3';
const TAG = 'whisper-cli-1.9.5';
const BASE = `https://github.com/${REPO}/releases/download/${TAG}`;
export const WHISPER_BUILD = Object.freeze({
  url: `${BASE}/whisper-cli-darwin-arm64`,
  sha256: '355c1791326a6dda1daebdd6a2b06bf127ad085cf021f5bb021bbbd652bed14b',
  licenseUrl: `${BASE}/LICENSE`,
  licenseSha256: '94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d',
});
const BUILDS = Object.freeze({
  'darwin-arm64': { name: 'whisper-cli', url: WHISPER_BUILD.url, sha256: WHISPER_BUILD.sha256 },
  'win32-x64': {
    name: 'whisper-cli.exe',
    url: `${BASE}/whisper-cli-win32-x64.exe`,
    sha256: 'd1d52fc4cff877dbf4407d9e492e402362c5abe6efa2fad205a23bfbeb2f9916',
  },
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const whisperDownloadable = (platform = process.platform, arch = process.arch) => Object.hasOwn(BUILDS, `${platform}-${arch}`);

/** Both a preexisting copy and a freshly downloaded copy must match the pinned build. */
export async function whisperIn(dir, platform = process.platform, arch = process.arch) {
  const build = BUILDS[`${platform}-${arch}`];
  if (!build) return false;
  try { return hash(await readFile(join(dir, build.name))) === build.sha256; }
  catch { return false; }
}

/**
 * Fetch into runtime/whisper, check binary and MIT license before publishing either.
 * `fetch` is injectable for tests; default gh uses the explicit smpbrighton account.
 */
export async function fetchWhisper(dir, { platform = process.platform, arch = process.arch, fetch: fetchImpl } = {}) {
  if (!whisperDownloadable(platform, arch)) throw new Error(`whisper-cli 를 찾지 못했다 (${platform}-${arch}). OPENFILM_U3_WHISPER_CLI를 지정하세요.`);
  const build = BUILDS[`${platform}-${arch}`];
  await mkdir(dir, { recursive: true });
  const work = await mkdtemp(join(dir, '.fetch-'));
  const published = [];
  try {
    const pinned = async (url, sha256) => {
      let bytes;
      if (fetchImpl) {
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(`whisper-cli 다운로드 HTTP ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
      } else {
        const token = process.env.GH_TOKEN || (await exec('gh', ['auth', 'token', '--user', 'smpbrighton'])).stdout.trim();
        const file = join(work, url.split('/').pop());
        // Never log the environment, token, or gh's command error object.
        try {
          await exec('gh', ['release', 'download', TAG, '--repo', REPO, '--pattern', url.split('/').pop(), '--output', file], { env: { ...process.env, GH_TOKEN: token } });
        } catch { throw new Error(`비공개 Whisper asset 받기 실패: ${url.split('/').pop()}. gh의 smpbrighton 인증을 확인하세요.`); }
        bytes = await readFile(file);
      }
      if (hash(bytes) !== sha256) throw new Error('whisper-cli 다운로드 SHA-256 검사가 실패했습니다. 파일을 보관하지 않았습니다.');
      return bytes;
    };
    const binary = await pinned(build.url, build.sha256);
    const license = await pinned(WHISPER_BUILD.licenseUrl, WHISPER_BUILD.licenseSha256);
    await writeFile(join(work, build.name), binary);
    if (platform !== 'win32') await chmod(join(work, build.name), 0o755);
    await writeFile(join(work, 'MIT-whisper.cpp.txt'), license);
    await rename(join(work, 'MIT-whisper.cpp.txt'), join(dir, 'LICENSE'));
    published.push(join(dir, 'LICENSE'));
    await rename(join(work, build.name), join(dir, build.name));
    published.push(join(dir, build.name));
    return dir;
  } catch (error) {
    await Promise.all(published.map((file) => rm(file, { force: true })));
    throw error;
  } finally { await rm(work, { recursive: true, force: true }); }
}
