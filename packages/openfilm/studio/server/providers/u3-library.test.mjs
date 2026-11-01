import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import u3Library from './u3-library.mjs';
import { libraryDir, listSfx } from '../u3-library.mjs';

const ctx = () => ({ key: '', root: '/project', signal: new AbortController().signal, say: () => {}, read: async () => new Uint8Array() });
const was = process.env.OPENFILM_U3_LIBRARY;
after(() => { if (was === undefined) delete process.env.OPENFILM_U3_LIBRARY; else process.env.OPENFILM_U3_LIBRARY = was; });

test('a keyless provider of sound effects only', async () => {
  assert.equal(u3Library.id, 'u3-library');
  assert.equal(u3Library.keyless, true);
  assert.deepEqual(u3Library.verbs, ['sfx']);
  await assert.rejects(u3Library.run('music', { out: 'x', prompt: 'y' }, ctx()), /u3 Library does not do music\./);
  await assert.rejects(u3Library.run('sfx', { out: 'x' }, ctx()), /--prompt is required/);
  await assert.rejects(u3Library.run('sfx', { out: 'a/b', prompt: '놀람' }, ctx()), /--out is a name/);
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
