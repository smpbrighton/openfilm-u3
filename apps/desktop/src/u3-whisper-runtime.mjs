/**
 * The installer's local ASR binary (no Electron imports). Only darwin-arm64 is published.
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
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const whisperDownloadable = (platform = process.platform, arch = process.arch) => platform === 'darwin' && arch === 'arm64';

/** Both a preexisting copy and a freshly downloaded copy must match the pinned build. */
export async function whisperIn(dir) {
  try { return hash(await readFile(join(dir, 'whisper-cli'))) === WHISPER_BUILD.sha256; }
  catch { return false; }
}

/**
 * Fetch into runtime/whisper, check binary and MIT license before publishing either.
 * `fetch` is injectable for tests; default gh uses the explicit smpbrighton account.
 */
export async function fetchWhisper(dir, { platform = process.platform, arch = process.arch, fetch: fetchImpl } = {}) {
  if (!whisperDownloadable(platform, arch)) throw new Error(`whisper-cli 를 찾지 못했다 (${platform}-${arch}). OPENFILM_U3_WHISPER_CLI를 지정하세요.`);
  await mkdir(dir, { recursive: true });
  const work = await mkdtemp(join(dir, '.fetch-'));
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
    const binary = await pinned(WHISPER_BUILD.url, WHISPER_BUILD.sha256);
    const license = await pinned(WHISPER_BUILD.licenseUrl, WHISPER_BUILD.licenseSha256);
    await writeFile(join(work, 'whisper-cli'), binary);
    await chmod(join(work, 'whisper-cli'), 0o755);
    await writeFile(join(work, 'MIT-whisper.cpp.txt'), license);
    await rename(join(work, 'MIT-whisper.cpp.txt'), join(dir, 'LICENSE'));
    await rename(join(work, 'whisper-cli'), join(dir, 'whisper-cli'));
    return dir;
  } finally { await rm(work, { recursive: true, force: true }); }
}
