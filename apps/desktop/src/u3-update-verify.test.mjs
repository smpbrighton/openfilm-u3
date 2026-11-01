import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createWindowsUpdateVerifier } from './u3-update-verify.mjs';

const fixture = (name) => new URL(`./fixtures/u3-minisign/${name}`, import.meta.url);
const signature = readFileSync(fixture('prehashed.minisig'), 'utf8');
const key = readFileSync(fixture('test.pub'), 'utf8');
const feed = 'https://github.com/smpbrighton/u3-studio-releases/releases/latest/download';
function setup({ publicKey = key, text = signature, fetcher, version = '0.2.8', files = [{ url: 'OpenFilm-Setup-x64.exe' }] } = {}) {
  const updater = new EventEmitter();
  const urls = [];
  const verify = createWindowsUpdateVerifier(updater, {
    product: { desktop: { updates: feed, minisignPublicKey: publicKey } }, arch: 'x64',
    fetch: fetcher ?? (async (url) => { urls.push(String(url)); return new Response(text); }),
  });
  updater.emit('update-available', { version, files });
  return { updater, urls, verify: (path = fixture('installer.bin')) => verify(['u3-minisign'], path) };
}

test('empty key, missing version, missing installer and version mismatch refuse the update', async () => {
  for (const options of [{ publicKey: '' }, { version: null }, { files: [] }, { version: '0.2.9' }, { text: 'broken' }]) assert.equal(typeof await setup(options).verify(), 'string');
  const empty = setup({ publicKey: '' }); await empty.verify(); assert.equal(empty.urls.length, 0);
});

test('fetch failure and unreadable installer return a fixed reason without URLs or host messages', async () => {
  for (const fetcher of [async () => { throw new Error(`${feed} secret response`); }, async () => new Response('private host message', { status: 404 })]) {
    const error = await setup({ fetcher }).verify();
    assert.equal(typeof error, 'string'); assert.doesNotMatch(error, /https|secret|private|response/);
  }
  assert.equal(typeof await setup().verify('/missing-installer.exe'), 'string');
});

test('valid update uses the feed installer name, not the temporary downloaded path', async () => {
  const state = setup();
  assert.equal(await state.verify(), null);
  assert.deepEqual(state.urls, [`${feed}/OpenFilm-Setup-x64.exe.minisig`]);
});

test('checking again clears stale version and installer metadata', async () => {
  const state = setup(); state.updater.emit('checking-for-update');
  assert.equal(typeof await state.verify(), 'string'); assert.equal(state.urls.length, 0);
});

test('installer selection matches the updater architecture and ignores the host in metadata', async () => {
  const state = setup({ files: [{ url: 'OpenFilm-Setup-arm64.exe' }, { url: 'https://example.invalid/build/OpenFilm-Setup-x64.exe' }] });
  assert.equal(await state.verify(), null);
  assert.deepEqual(state.urls, [`${feed}/OpenFilm-Setup-x64.exe.minisig`]);
});
