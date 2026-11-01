import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchWhisper, whisperDownloadable, whisperIn } from './u3-whisper-runtime.mjs';

test('a binary with the wrong checksum is refused and no partial files remain', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'of-whisper-runtime-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(fetchWhisper(dir, { platform: 'darwin', arch: 'arm64', fetch: async () => new Response('wrong binary') }), /SHA-256/);
  assert.equal(await whisperIn(dir), false);
  assert.deepEqual(readdirSync(dir), []);
  writeFileSync(join(dir, 'whisper-cli'), 'corrupt cached copy');
  assert.equal(await whisperIn(dir), false);
});

test('only Mac arm64 has a published build; Windows gives the missing CLI sentence', async () => {
  assert.equal(whisperDownloadable('darwin', 'arm64'), true);
  for (const [platform, arch] of [['win32', 'x64'], ['darwin', 'x64'], ['linux', 'arm64']]) {
    assert.equal(whisperDownloadable(platform, arch), false);
    await assert.rejects(fetchWhisper('/unused', { platform, arch }), /whisper-cli 를 찾지 못했다/);
  }
});

test('HTTP errors are reported before a binary is published', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'of-whisper-runtime-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(fetchWhisper(dir, { platform: 'darwin', arch: 'arm64', fetch: async () => new Response('', { status: 403 }) }), /HTTP 403/);
  assert.deepEqual(readdirSync(dir), []);
});
