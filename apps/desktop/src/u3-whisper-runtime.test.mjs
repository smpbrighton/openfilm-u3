import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchWhisper, whisperDownloadable, whisperIn } from './u3-whisper-runtime.mjs';

const BASE = 'https://github.com/smpbrighton/openfilm-u3/releases/download/whisper-cli-1.9.5';
const MAC = { asset: 'whisper-cli-darwin-arm64', bytes: Buffer.from('fixture Mach-O'), sha256: '355c1791326a6dda1daebdd6a2b06bf127ad085cf021f5bb021bbbd652bed14b' };
const WIN = { asset: 'whisper-cli-win32-x64.exe', bytes: Buffer.from('MZ fixture PE'), sha256: 'd1d52fc4cff877dbf4407d9e492e402362c5abe6efa2fad205a23bfbeb2f9916' };
const LICENSE = { asset: 'LICENSE', bytes: Buffer.from('fixture MIT license'), sha256: '94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d' };

/** Only these small stand-ins get the published digests. All other bytes use real SHA-256. */
function fixtureChecksums(t) {
  const createHash = crypto.createHash;
  const pins = new Map([MAC, WIN, LICENSE].map(({ bytes, sha256 }) => [createHash('sha256').update(bytes).digest('hex'), sha256]));
  t.mock.method(crypto, 'createHash', (...args) => {
    const hash = createHash(...args);
    const digest = hash.digest.bind(hash);
    hash.digest = (encoding) => {
      const value = digest(encoding);
      return encoding === 'hex' ? pins.get(value) ?? value : value;
    };
    return hash;
  });
  syncBuiltinESMExports();
  t.after(() => { crypto.createHash.mock.restore(); syncBuiltinESMExports(); });
}

function temporaryDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'of-whisper-runtime-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const fixtureFetch = (asked) => async (url) => {
  asked.push(url);
  const file = [MAC, WIN, LICENSE].find(({ asset }) => url === `${BASE}/${asset}`);
  assert.ok(file, `unexpected download: ${url}`);
  return new Response(file.bytes);
};

test('a binary with the wrong checksum is refused and no partial files remain', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'of-whisper-runtime-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(fetchWhisper(dir, { platform: 'darwin', arch: 'arm64', fetch: async () => new Response('wrong binary') }), /SHA-256/);
  assert.equal(await whisperIn(dir), false);
  assert.deepEqual(readdirSync(dir), []);
  writeFileSync(join(dir, 'whisper-cli'), 'corrupt cached copy');
  assert.equal(await whisperIn(dir), false);
});

test('Mac arm64 and Windows x64 are downloadable; Windows arm64 and other targets are not', async () => {
  assert.equal(whisperDownloadable('darwin', 'arm64'), true);
  assert.equal(whisperDownloadable('win32', 'x64'), true);
  for (const [platform, arch] of [['win32', 'arm64'], ['darwin', 'x64'], ['linux', 'arm64'], ['linux', 'x64']]) {
    assert.equal(whisperDownloadable(platform, arch), false);
    await assert.rejects(fetchWhisper('/unused', { platform, arch }), /whisper-cli 를 찾지 못했다/);
  }
});

test('Windows x64 installs the pinned exe and shared LICENSE with no other files', async (t) => {
  fixtureChecksums(t);
  const dir = temporaryDir(t);
  const asked = [];
  assert.equal(await fetchWhisper(dir, { platform: 'win32', arch: 'x64', fetch: fixtureFetch(asked) }), dir);
  assert.deepEqual(asked, [`${BASE}/${WIN.asset}`, `${BASE}/LICENSE`]);
  assert.deepEqual(readdirSync(dir).sort(), ['LICENSE', 'whisper-cli.exe']);
  assert.deepEqual(readFileSync(join(dir, 'whisper-cli.exe')), WIN.bytes);
  assert.deepEqual(readFileSync(join(dir, 'LICENSE')), LICENSE.bytes);
  assert.equal(await whisperIn(dir, 'win32', 'x64'), true);
  assert.equal(await whisperIn(dir, 'darwin', 'arm64'), false);
});

test('Windows binary hash failure leaves no files', async (t) => {
  const dir = temporaryDir(t);
  const asked = [];
  await assert.rejects(fetchWhisper(dir, { platform: 'win32', arch: 'x64', fetch: async (url) => {
    asked.push(url);
    return new Response('wrong Windows binary');
  } }), /SHA-256/);
  assert.deepEqual(asked, [`${BASE}/${WIN.asset}`]);
  assert.deepEqual(readdirSync(dir), []);
  assert.equal(await whisperIn(dir, 'win32', 'x64'), false);
});

test('a Windows LICENSE hash or HTTP failure leaves no binary or temporary files', async (t) => {
  fixtureChecksums(t);
  for (const response of [() => new Response('wrong license'), () => new Response('', { status: 403 })]) {
    const dir = temporaryDir(t);
    await assert.rejects(fetchWhisper(dir, { platform: 'win32', arch: 'x64', fetch: async (url) => {
      assert.ok(url === `${BASE}/${WIN.asset}` || url === `${BASE}/LICENSE`);
      return url.endsWith('/LICENSE') ? response() : new Response(WIN.bytes);
    } }), /SHA-256|HTTP 403/);
    assert.deepEqual(readdirSync(dir), []);
  }
});

test('whisperIn requires each target binary name and digest, including the unchanged Mac layout', async (t) => {
  fixtureChecksums(t);
  for (const [platform, arch, build, name, wrongName] of [
    ['darwin', 'arm64', MAC, 'whisper-cli', 'whisper-cli.exe'],
    ['win32', 'x64', WIN, 'whisper-cli.exe', 'whisper-cli'],
  ]) {
    const dir = temporaryDir(t);
    await fetchWhisper(dir, { platform, arch, fetch: fixtureFetch([]) });
    assert.deepEqual(readdirSync(dir).sort(), ['LICENSE', name]);
    assert.equal(await whisperIn(dir, platform, arch), true);
    renameSync(join(dir, name), join(dir, wrongName));
    assert.equal(await whisperIn(dir, platform, arch), false);
    renameSync(join(dir, wrongName), join(dir, name));
    writeFileSync(join(dir, name), build === MAC ? WIN.bytes : MAC.bytes);
    assert.equal(await whisperIn(dir, platform, arch), false);
    assert.equal(await whisperIn(dir, 'win32', 'arm64'), false);
  }
});

test('HTTP errors are reported before a binary is published', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'of-whisper-runtime-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(fetchWhisper(dir, { platform: 'darwin', arch: 'arm64', fetch: async () => new Response('', { status: 403 }) }), /HTTP 403/);
  assert.deepEqual(readdirSync(dir), []);
});
