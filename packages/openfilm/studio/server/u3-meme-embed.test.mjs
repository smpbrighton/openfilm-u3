import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BGE_FILES, BGE_REVISION, downloadModelFile, memeDoc, memeDocHash, mergeCandidates, modelStore, readMemeIndex, searchMemeIndex, memeSearch } from './u3-meme-embed.mjs';
import { matchMemes, rankMemes } from './u3-library.mjs';

const made = [];
const temp = () => { const p = mkdtempSync(join(tmpdir(), 'of-u3-embed-')); made.push(p); return p; };
after(() => { for (const p of made) rmSync(p, { recursive: true, force: true }); });
const meme = (id, description = id) => ({ id, emotion: '웃음', description, situations: ['반응'], importedAt: '2026-01-01' });
const library = [meme('a', '웃음'), meme('b', '눈이 커진다'), meme('c', '놀람')];
function indexAt(dir, items = library, dim = 2, vectors = [1, 0, 0, 1, 0.5, 0.5]) {
  const folder = join(dir, 'meme-embed');
  mkdirSync(folder, { recursive: true });
  const meta = { model: 'bge-m3', dim, items: items.map((m) => ({ id: m.id, docHash: memeDocHash(memeDoc(m)) })) };
  writeFileSync(join(folder, 'bge-m3.json'), JSON.stringify(meta));
  const bytes = Buffer.alloc(vectors.length * 4);
  vectors.forEach((v, i) => bytes.writeFloatLE(v, i * 4));
  writeFileSync(join(folder, 'bge-m3.f32'), bytes);
  return folder;
}
const readyStore = { root: '/unused', ready: async () => true, status: async () => ({ state: 'ready' }), download: async () => {} };
const digest = (data) => createHash('sha256').update(data).digest('hex');
const modelFile = (data = 'abcdefgh') => ({ relativePath: 'config.json', url: 'https://example.invalid/fixed', size: data.length, sha256: digest(data) });

test('u3 document and 16-digit hash match the source format', () => {
  assert.equal(memeDoc(library[0]), '웃음: 웃음 (반응)');
  assert.equal(memeDocHash(memeDoc(library[0])), digest('웃음: 웃음 (반응)').slice(0, 16));
  assert.equal(BGE_REVISION, '4de13258303883538bd53b696b452bf8099f0858');
  assert.equal(BGE_FILES.length, 7);
  assert.equal(BGE_FILES.at(-1).size, 2266820608);
});

test('index byte length, model, metadata and finite rows are checked', async () => {
  const dir = temp(); const folder = indexAt(dir);
  const index = await readMemeIndex(folder);
  assert.equal(index.matrix.length, 6);
  writeFileSync(join(folder, 'bge-m3.f32'), Buffer.alloc(20));
  assert.equal(await readMemeIndex(folder), null, 'truncated row rejected');
  indexAt(dir, library, 2, [NaN, 0, 0, 1, 1, 1]);
  assert.equal(await readMemeIndex(folder), null);
  indexAt(dir);
  const meta = JSON.parse(readFileSync(join(folder, 'bge-m3.json')));
  meta.model = 'wrong'; writeFileSync(join(folder, 'bge-m3.json'), JSON.stringify(meta));
  assert.equal(await readMemeIndex(folder), null);
  assert.equal(await readMemeIndex('/missing'), null);
});

test('inner product top 40 excludes changed/deleted sidecars and preserves tie row order', async () => {
  const index = await readMemeIndex(indexAt(temp()));
  assert.deepEqual(searchMemeIndex(index, [0, 1], library).map((r) => r.id), ['b', 'c', 'a']);
  assert.deepEqual(searchMemeIndex(index, [1, 1], library).map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(searchMemeIndex(index, [0, 1], [{ ...library[1], description: 'changed' }, library[0]]).map((r) => r.id), ['a']);
  assert.throws(() => searchMemeIndex(index, [1], library), /dimension/);
});

test('candidates merge bge first, rule top 10 next, once each; both orders deterministic', async () => {
  assert.deepEqual(mergeCandidates(['b', 'a'], ['a', 'c']), ['b', 'a', 'c']);
  const dir = temp(); indexAt(dir);
  const calls = [];
  const search = memeSearch({ store: readyStore, embedder: { embed: async (text) => { calls.push(text); return [0, 1]; } } });
  const one = await rankMemes({ query: '웃음' }, library, 50, {}, dir, search);
  const two = await rankMemes({ query: '웃음' }, library, 50, {}, dir, search);
  assert.deepEqual(one.map((r) => r.meme.id), ['b', 'c', 'a']);
  assert.deepEqual(two, one);
  assert.deepEqual(calls, ['웃음'], 'pagination/repeated queries reuse embedding');
  const excluded = await rankMemes({ query: '웃음' }, library, 50, { exclude: ['b'] }, dir, search);
  assert.deepEqual(excluded.map((r) => r.meme.id), ['c', 'a']);
  const many = Array.from({ length: 60 }, (_, i) => meme(String(i).padStart(2, '0'), '웃음'));
  const stub = { search: async () => many.slice(10, 50).map((m) => ({ id: m.id, sim: 1 })) };
  const merged = await rankMemes({ query: '웃음' }, many, 60, {}, dir, stub);
  assert.equal(merged.length, 50);
  assert.deepEqual(merged.slice(40).map((r) => r.meme.id), many.slice(0, 10).map((m) => m.id));
});

test('no modules/model/index or inference error keeps the exact previous rule result; no download', async () => {
  let downloads = 0;
  const store = { ...readyStore, download: async () => { downloads++; } };
  const none = memeSearch({ store, modules: '' });
  const expected = matchMemes({ query: '웃음' }, library, 50);
  assert.deepEqual(await rankMemes({ query: '웃음' }, library, 50, {}, temp(), none), expected);
  assert.equal((await none.status()).available, false);
  assert.throws(() => none.download(), /desktop/);
  const fail = memeSearch({ store, embedder: { embed: async () => { throw new Error('native failure'); } } });
  const dir = temp(); indexAt(dir);
  assert.deepEqual(await rankMemes({ query: '웃음' }, library, 50, {}, dir, fail), expected);
  assert.match((await fail.status()).embedError, /native failure/);
  const missing = memeSearch({ store: { ...store, ready: async () => false }, embedder: { embed: () => { throw Error('must not run'); } } });
  assert.equal(await missing.search('x', library, dir), null);
  assert.equal(downloads, 0);
});

test('download refuses wrong hash and never exposes a final file', async () => {
  const dest = join(temp(), 'model');
  await assert.rejects(downloadModelFile({ file: modelFile(), destination: dest, fetcher: async () => new Response('badbytes') }), /SHA-256/);
  assert.equal(existsSync(dest), false);
  assert.equal(existsSync(dest + '.part'), false);
});

test('Range resume, ignored Range restart and invalid range rejection', async () => {
  const dest = join(temp(), 'model'); writeFileSync(dest + '.part', 'abc');
  await downloadModelFile({ file: modelFile(), destination: dest, fetcher: async (url, options) => {
    assert.equal(options.headers.Range, 'bytes=3-');
    return new Response('defgh', { status: 206, headers: { 'content-range': 'bytes 3-7/8' } });
  } });
  assert.equal(readFileSync(dest, 'utf8'), 'abcdefgh');
  const other = join(temp(), 'model'); writeFileSync(other + '.part', 'abc');
  await downloadModelFile({ file: modelFile(), destination: other, fetcher: async () => new Response('abcdefgh') });
  assert.equal(readFileSync(other, 'utf8'), 'abcdefgh');
  const wrong = join(temp(), 'model'); writeFileSync(wrong + '.part', 'abc');
  await assert.rejects(downloadModelFile({ file: modelFile(), destination: wrong, fetcher: async () => new Response('abcdefgh', { status: 206, headers: { 'content-range': 'bytes 0-7/8' } }) }), /범위/);
  assert.equal(readFileSync(wrong + '.part', 'utf8'), 'abc');
});

test('model status/download concurrency, progress, reuse and local corruption check', async () => {
  let calls = 0; let release;
  const wait = new Promise((r) => { release = r; });
  const root = temp();
  const store = modelStore({ root, files: [modelFile()], fetcher: async () => { calls++; await wait; return new Response('abcdefgh'); } });
  assert.equal((await store.status()).state, 'missing');
  const one = store.download(); const two = store.download();
  assert.equal(one, two);
  assert.equal((await store.status()).state, 'downloading');
  release(); await one;
  assert.equal((await store.status()).state, 'ready');
  assert.equal((await store.status()).progress, 1);
  await store.download(); assert.equal(calls, 1);
  writeFileSync(join(root, 'Xenova/bge-m3/config.json'), 'xxxxxxxx');
  assert.equal(await store.ready(), false);
  const bad = modelStore({ root: temp(), files: [modelFile()], fetcher: async () => new Response('xxxxxxxx') });
  await assert.rejects(bad.download(), /SHA-256/);
  assert.equal((await bad.status()).state, 'error');
});
