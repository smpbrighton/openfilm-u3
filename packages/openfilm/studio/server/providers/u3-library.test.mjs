import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import u3Library from './u3-library.mjs';
import { libraryDir, listSfx } from '../u3-library.mjs';

const ctx = () => ({ key: '', root: '/project', signal: new AbortController().signal, say: () => {}, read: async () => new Uint8Array() });
const was = process.env.OPENFILM_U3_LIBRARY;
after(() => { if (was === undefined) delete process.env.OPENFILM_U3_LIBRARY; else process.env.OPENFILM_U3_LIBRARY = was; });

test('a keyless provider of sound effects and memes', async () => {
  assert.equal(u3Library.id, 'u3-library');
  assert.equal(u3Library.keyless, true);
  assert.deepEqual(u3Library.verbs, ['sfx', 'meme']);
  await assert.rejects(u3Library.run('music', { out: 'x', prompt: 'y' }, ctx()), /u3 Library does not do music\./);
  await assert.rejects(u3Library.run('sfx', { out: 'x' }, ctx()), /--prompt is required/);
  await assert.rejects(u3Library.run('sfx', { out: 'a/b', prompt: '놀람' }, ctx()), /--out is a name/);
});

test('each kind it makes has a model to pick in Settings → Models (one, the library)', () => {
  for (const verb of u3Library.verbs) assert.equal(u3Library.models?.[verb]?.length, 1, `${verb} has no model to pick`);
});

test('놀람 lands the best shock as assets/audio/sfx/<out>.mp3, the library\'s bytes as they are', async () => {
  delete process.env.OPENFILM_U3_LIBRARY;
  const result = await u3Library.run('sfx', { out: 'boom', prompt: '놀람' }, ctx());
  const best = (await listSfx(libraryDir())).find((i) => i.id === result.receipt.id);
  assert.equal(best.category, 'shock');
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].path, 'assets/audio/sfx/boom.mp3');
  assert.deepEqual(Buffer.from(result.files[0].bytes), readFileSync(best.path));
  assert.deepEqual(result.index, [{ src: 'assets/audio/sfx/boom.mp3', kind: 'audio', dur: best.durationSec, from: { mode: 'library', prompt: '놀람', provider: 'u3-library', id: best.id } }]);
  assert.deepEqual(Object.keys(result.receipt), ['provider', 'id', 'title', 'category', 'src', 'dur', 'candidates']);
  assert.equal(result.receipt.candidates.length, 5);
  assert.equal(result.receipt.candidates[0].id, best.id);
  assert.equal(result.cost, undefined, 'nothing is billed');
});

test('one prompt is one file, every time; --sec is said to be not honored', async () => {
  delete process.env.OPENFILM_U3_LIBRARY;
  const one = await u3Library.run('sfx', { out: 'a', prompt: '반전' }, ctx());
  const two = await u3Library.run('sfx', { out: 'a', prompt: '반전', sec: 2 }, ctx());
  assert.equal(one.receipt.id, two.receipt.id);
  assert.ok(['reveal', 'shock'].includes(one.receipt.category));
  assert.deepEqual(two.receipt.notes, ['--sec is not honored: a library sound is as long as it is']);
  assert.equal(one.receipt.notes, undefined);
});

test('a prompt nothing fits says so, with the categories', async () => {
  delete process.env.OPENFILM_U3_LIBRARY;
  await assert.rejects(u3Library.run('sfx', { out: 'a', prompt: '날씨' }, ctx()), /Nothing in the u3 library fits "날씨".*shock/);
});

test('no library: where it was looked for, and how to point at one', async () => {
  const dir = join(tmpdir(), 'of-u3-no-such-library');
  rmSync(dir, { recursive: true, force: true });
  process.env.OPENFILM_U3_LIBRARY = dir;
  await assert.rejects(u3Library.run('sfx', { out: 'a', prompt: '놀람' }, ctx()), (e) => e.message.includes(dir) && /OPENFILM_U3_LIBRARY/.test(e.message));
});

/* ── memes, from a library of their own ── */
const made = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
const temp = (name) => { const dir = mkdtempSync(join(tmpdir(), name)); made.push(dir); return dir; };

function memeLibrary() {
  const dir = temp('of-u3-memes-');
  const add = (folder, meta, bytes) => {
    mkdirSync(join(dir, 'memes', folder), { recursive: true });
    writeFileSync(join(dir, 'memes', folder, `${meta.id}.mp4`), bytes);
    writeFileSync(join(dir, 'memes', folder, `${meta.id}.json`), JSON.stringify({ situations: [], tagsConfirmed: false, importedAt: '2026-09-01T00:00:00.000Z', durationSec: 2, width: 320, height: 240, ...meta }));
  };
  add('confused', { id: 'tenor-a', emotion: '당황', situations: ['황당함'], importedAt: '2026-09-02T00:00:00.000Z' }, 'meme a');
  add('confused', { id: 'tenor-b', emotion: '당황', situations: ['황당함'] }, 'meme b');
  add('laugh', { id: 'giphy-c', emotion: '웃음', width: 480, height: 270 }, 'meme c');
  return dir;
}
/** A project at a folder of its own: its film.html, read as get.mjs reads a project file. */
const project = (filmText) => {
  const root = temp('of-u3-meme-project-');
  if (filmText !== undefined) writeFileSync(join(root, 'film.html'), filmText);
  return { ...ctx(), root, read: async (path) => new Uint8Array(await readFile(join(root, path))) };
};
const film = (...srcs) => `<!doctype html>\n<html><head><meta name="viewport" content="width=1920, height=1080"></head><body>\n<section>\n${srcs.map((src) => `  <video src="${src}"></video>`).join('\n')}\n</section>\n</body></html>\n`;

test('meme: the best one lands as assets/video/memes/<out>.mp4, the library\'s bytes, a muted video row', async () => {
  const lib = memeLibrary();
  process.env.OPENFILM_U3_LIBRARY = lib;
  const result = await u3Library.run('meme', { out: 'huh', prompt: '황당함' }, project());
  assert.equal(result.receipt.id, 'tenor-a', 'equal scores: the newest first');
  assert.deepEqual(result.files.map((f) => f.path), ['assets/video/memes/huh.mp4']);
  assert.deepEqual(Buffer.from(result.files[0].bytes), readFileSync(join(lib, 'memes', 'confused', 'tenor-a.mp4')));
  assert.deepEqual(result.index, [{ src: 'assets/video/memes/huh.mp4', kind: 'video', w: 320, h: 240, dur: 2, hasAudio: false, from: { mode: 'library', provider: 'u3-library', id: 'tenor-a', prompt: '황당함' } }]);
  assert.deepEqual(Object.keys(result.receipt), ['provider', 'id', 'emotion', 'description', 'src', 'dur', 'width', 'height', 'candidates']);
  assert.deepEqual(result.receipt.candidates.map((c) => c.id), ['tenor-a', 'tenor-b', 'giphy-c']);
  /* the reaction names the feeling */
  assert.equal((await u3Library.run('meme', { out: 'lol', prompt: '친구가 넘어짐', reaction: '웃음' }, project())).receipt.id, 'giphy-c');
});

test('meme: one prompt and one film.html are one meme, every time; one the film uses is not picked again, a renamed copy too', async () => {
  const lib = memeLibrary();
  process.env.OPENFILM_U3_LIBRARY = lib;
  const empty = project(film('assets/video/footage.mp4'));
  const one = await u3Library.run('meme', { out: 'a', prompt: '황당함' }, empty);
  const two = await u3Library.run('meme', { out: 'a', prompt: '황당함' }, empty);
  assert.equal(one.receipt.id, two.receipt.id);
  const using = project(film('assets/video/footage.mp4', 'assets/video/memes/renamed.mp4'));
  mkdirSync(join(using.root, 'assets', 'video', 'memes'), { recursive: true });
  copyFileSync(join(lib, 'memes', 'confused', 'tenor-a.mp4'), join(using.root, 'assets', 'video', 'memes', 'renamed.mp4'));
  const next = await u3Library.run('meme', { out: 'b', prompt: '황당함' }, using);
  assert.equal(next.receipt.id, 'tenor-b');
  assert.deepEqual(next.receipt.excluded, ['tenor-a']);
  assert.ok(!next.receipt.candidates.some((c) => c.id === 'tenor-a'));
});

test('meme: a scene nothing fits says so, with the feelings; so does one only used memes fit', async () => {
  process.env.OPENFILM_U3_LIBRARY = memeLibrary();
  await assert.rejects(u3Library.run('meme', { out: 'a', prompt: '날씨' }, project()), /Nothing in the u3 library fits "날씨": .*--reaction \(인정, 분노/);
  await assert.rejects(u3Library.run('meme', { out: 'a' }, project()), /--prompt is required/);
  await assert.rejects(u3Library.run('meme', { out: '../a', prompt: '황당함' }, project()), /--out is a name/);
});

test('meme: a library without memes says how to fetch them', async () => {
  process.env.OPENFILM_U3_LIBRARY = temp('of-u3-no-memes-');
  await assert.rejects(u3Library.run('meme', { out: 'a', prompt: '황당함' }, project()), /has no memes\/: fetch them with `node u3\/scripts\/fetch-library\.mjs`/);
});
