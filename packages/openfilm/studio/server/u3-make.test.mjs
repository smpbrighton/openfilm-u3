import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { filmHtml, readFilmFile } from '../../src/film-doc.mjs';
import { applyMake, chooseMissingInputMemes, fnv1a, makeFilm, memeBox, pickSfxFile, planFilm, rankMode, readScenes, resolveSceneSfx, resolveScriptMemes } from './u3-make.mjs';
import { libraryDir, listMemes, matchMemes, rankMemes } from './u3-library.mjs';
import { memeDoc, memeDocHash, memeSearch } from './u3-meme-embed.mjs';
import { changeProjectFilm } from './film.mjs';
import { catalog, runGet } from './get.mjs';

const scene = (over = {}) => ({ inputIndex: 1, startSec: 0, endSec: 2, caption: '장면 *강조*', subCaption: 'A *scene*', reaction: '웃음', memeBefore: false, memeAfter: false, sfxCategory: null, ...over });
const meme = (id, over = {}) => ({ id, emotion: '웃음', situations: [], description: '', importedAt: '2026-01-01', tagsConfirmed: false, durationSec: 5, width: 400, height: 200, path: `/library/memes/laugh/${id}.mp4`, size: 3, ...over });
const a = meme('a'), b = meme('b'), c = meme('c');
const input = (src = 'a.mp4') => ({ src, duration: 12, width: 1920, height: 1080 });
const table = scenes => ({ scenes, inputs: [input(), input('b.mp4')], hash: 'abcd'.repeat(16) });
const stage = { w: 1080, h: 1920 };
const library = (memes = [a, b, c], sfx = []) => ({ memes, sfx });
const plan = (scenes, memes = [a, b, c], sfx = [], opts = {}) => planFilm(table(scenes), library(memes, sfx), () => memes, { stage, ...opts });
const tracks = (p, role) => p.tracks.filter(t => t.role === role);
const clips = (p, role) => tracks(p, role).flatMap(t => t.clips);
const film = async root => readFilmFile(await readFile(join(root, 'film.html'), 'utf8')).value;
const measure = async () => ({ duration: 12, width: 1920, height: 1080 });
const ruleSearch = { status: async () => ({ available: false, state: 'missing' }), search: async () => { throw new Error('rule must never call search'); } };

async function project(t, value = { stage, tracks: [{ clips: [{ id: 'make-up', src: 'make-up.mp4', time: [0, 10] }] }] }) {
  const root = await mkdtemp(join(tmpdir(), 'of-u3-make-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'film.html'), filmHtml(value));
  await writeFile(join(root, 'a.mp4'), 'input-a');
  await writeFile(join(root, 'b.mp4'), 'input-b');
  await writeFile(join(root, 'scenes.json'), JSON.stringify({ inputs: ['a.mp4', 'b.mp4'], scenes: [scene()] }));
  return root;
}
async function save(root, value) { await writeFile(join(root, 'scenes.json'), JSON.stringify(value)); }
async function fakeLibrary(t, memes = [a, b, c], sounds = []) {
  const dir = await mkdtemp(join(tmpdir(), 'of-u3-make-lib-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'memes', 'laugh'), { recursive: true });
  for (const m of memes) {
    await writeFile(join(dir, 'memes', 'laugh', `${m.id}.mp4`), `meme-${m.id}`);
    await writeFile(join(dir, 'memes', 'laugh', `${m.id}.json`), JSON.stringify(m));
  }
  for (const s of sounds) {
    await mkdir(join(dir, 'sfx', s.category), { recursive: true });
    await writeFile(join(dir, 'sfx', s.category, `${s.id}.mp3`), `sound-${s.id}`);
    await writeFile(join(dir, 'sfx', s.category, `${s.id}.json`), JSON.stringify({ ...s, file: `${s.id}.mp3` }));
  }
  return dir;
}
const sound = (id, category = 'laugh', durationSec = 0.4) => ({ id, category, durationSec, path: `/sfx/${id}.mp3`, title: id, source: 'local', license: 'test' });

// Validation is aggregated, with original film bytes checked after every rejection.
test('scene-table validation collects all scene numbers, checks files and source duration, and never changes film', async t => {
  const root = await project(t);
  const before = await readFile(join(root, 'film.html'), 'utf8');
  const invalid = [
    scene({ inputIndex: 0 }), scene({ inputIndex: 3 }), scene({ inputIndex: 1.5 }),
    scene({ startSec: -1 }), scene({ startSec: 2, endSec: 2 }), scene({ startSec: null, endSec: null }),
    scene({ startSec: '0' }), scene({ endSec: 13 }), scene({ caption: '' }), scene({ caption: 3 }),
    scene({ subCaption: null }), scene({ reaction: 'nope' }), scene({ reaction: null, memeBefore: true }),
    scene({ reaction: null, memeAfter: true }), scene({ sfxCategory: 'unknown' }), scene({ memeBefore: 1 }),
    scene({ memeAfter: 'false' }), null, 'scene', scene({ reaction: undefined }), scene({ sfxCategory: undefined }),
  ];
  await save(root, { inputs: ['a.mp4', 'missing.mp4'], scenes: invalid });
  await assert.rejects(readScenes(root, 'scenes.json', { probe: measure }), e => {
    for (let i = 1; i <= invalid.length; i++) assert.ok(e.message.includes(`장면 ${i}:`), e.message);
    assert.match(e.message, /입력 2:/);
    return true;
  });
  for (const value of [null, [], {}, { inputs: [], scenes: [] }, { inputs: ['a.mp4'], scenes: [] }, { title: 'x'.repeat(31), inputs: ['a.mp4'], scenes: [scene()] }, { inputs: ['../outside.mp4'], scenes: [scene()] }, { inputs: ['a.mp3'], scenes: [scene()] }, { inputs: ['https://x/a.mp4'], scenes: [scene()] }, { inputs: [3], scenes: [scene()] }]) {
    await save(root, value);
    await assert.rejects(readScenes(root, 'scenes.json', { probe: measure }));
    assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
  }
  await writeFile(join(root, 'scenes.json'), '{bad json');
  await assert.rejects(readScenes(root, 'scenes.json'), /JSON/);
  await assert.rejects(readScenes(root, '../outside.json'), /inside the project/);
  await assert.rejects(readScenes(root, 'missing.json'), /장면표/);
  await save(root, { inputs: ['a.mp4'], scenes: [scene({ endSec: 1e309 })] });
  await assert.rejects(readScenes(root, 'scenes.json', { probe: measure }), /영상 구간/);
  await save(root, { title: '제목', inputs: ['a.mp4'], scenes: [scene({ memeBefore: undefined, memeAfter: undefined })] });
  for (const info of [{ duration: null, width: 1, height: 1 }, { duration: 10 }, { duration: -1, width: 3, height: 3 }]) {
    await assert.rejects(readScenes(root, 'scenes.json', { probe: async () => info }), /길이와 크기/);
  }
  const valid = await readScenes(root, 'scenes.json', { probe: measure });
  assert.equal(valid.scenes[0].memeBefore, false);
  assert.equal(valid.hash, createHash('sha256').update(await readFile(join(root, 'scenes.json'))).digest('hex'));
  assert.equal(valid.title, '제목');
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
});

test('u3 contiguous cuts merge within 0.05 seconds, keep gapless cue timing and preserve summed cut lengths', () => {
  const scenes = [scene({ startSec: 0.3, endSec: 2.4 }), scene({ startSec: 2.4, endSec: 5.2 }), scene({ inputIndex: 2, startSec: 0.3, endSec: 2.4 }), scene({ inputIndex: 2, startSec: 2.4, endSec: 6.6 })];
  const p = plan(scenes, []);
  assert.deepEqual(clips(p, 'source').map(c => [c.src, c.at, c.time]), [['a.mp4', 0, [0.3, 5.2]], ['b.mp4', 4.9, [0.3, 6.6]]]);
  assert.deepEqual(clips(p, 'subtitle').map(c => [c.at, c.time[1]]), [[0, 2.1], [2.1, 2.8], [4.9, 2.1], [7, 4.2]]);
  const near = plan([scenes[0], scene({ startSec: 2.42, endSec: 5.2 })], []);
  assert.deepEqual(clips(near, 'source')[0].time, [0.3, 5.18]);
  assert.equal(near.receipt.duration, 4.88);
  assert.equal(clips(plan([scenes[0], scene({ startSec: 3, endSec: 5 })], []), 'source').length, 2);
  assert.equal(clips(plan([scenes[0], scene({ startSec: 2.45, endSec: 5 })], []), 'source').length, 1);
  assert.equal(clips(plan([scenes[0], scene({ startSec: 2.451, endSec: 5 })], []), 'source').length, 2);
  assert.deepEqual(clips(p, 'source')[0].box, { x: -1166.667, y: 0, w: 3413.333, h: 1920 });
  assert.equal(clips(p, 'source')[0].volume, undefined, 'original sound is kept');
  assert.deepEqual(clips(p, 'subtitle')[0].overrides.map(o => o.text), ['장면 *강조*', 'A *scene*']);
});

test('u3 placement four combinations, alternate shortage, duplicate prevention and exact durations', () => {
  for (const [before, after, positions] of [[true, false, ['before']], [false, true, ['after']], [false, false, ['after']], [true, true, ['before', 'after']]]) {
    const p = plan([scene({ endSec: 3, memeBefore: before, memeAfter: after })]);
    assert.deepEqual(p.receipt.memes.map(m => m.position), positions);
    assert.deepEqual(p.receipt.memes.map(m => m.id), ['a', 'b'].slice(0, positions.length));
    assert.deepEqual(p.receipt.memes.map(m => [m.at, m.dur]), positions.map(p => [p === 'before' ? 0 : 1, 2]));
  }
  const shortage = plan([scene({ memeBefore: true, memeAfter: true })], [a]);
  assert.deepEqual(shortage.receipt.memes.map(m => m.position), ['after']);
  const short = plan([scene({ endSec: 0.5, memeBefore: true, memeAfter: true })], [a, b]);
  assert.equal(tracks(short, 'meme').length, 2, 'overlapping before/after use two lanes');
  assert.ok(clips(short, 'meme').every(c => c.at === 0 && c.time[1] === 0.5 && c.volume === 0));
  assert.deepEqual(clips(short, 'meme')[0].box, { x: 216, y: 798, w: 648, h: 324 });
  const tiny = plan([scene()], [meme('tiny', { durationSec: 0.3 })]);
  assert.deepEqual(tiny.receipt.memes.map(m => [m.at, m.dur]), [[1.7, 0.3]]);
  const two = plan([scene({ memeBefore: true }), scene({ inputIndex: 2, memeAfter: true })]);
  assert.deepEqual(two.receipt.memes.map(m => m.id), ['a', 'b']);
  assert.equal(tracks(two, 'meme').length, 1, 'touching clips share the lowest lane');
});

test('u3 missing-input fallback uses the last scene with candidates and never repeats primary or alternate ids', () => {
  const scenes = [scene({ reaction: null }), scene({ reaction: null }), scene({ reaction: null, inputIndex: 2 }), scene({ reaction: null, inputIndex: 2 })];
  const resolved = resolveScriptMemes(scenes, [[a], [b], [a], [b]]);
  const filled = chooseMissingInputMemes(resolved, [[a, b], [a, b], [a, b], [a, b]]);
  assert.deepEqual(Object.entries(filled.memes).map(([i, m]) => [Number(i), m.id]), [[1, 'a'], [3, 'b']]);
  const lastHasNoCandidate = chooseMissingInputMemes(resolved, [[a], [], [b], []]);
  assert.deepEqual(Object.keys(lastHasNoCandidate.memes), ['0', '2']);
  const withBoth = resolveScriptMemes([scene({ memeBefore: true, memeAfter: true }), scene({ inputIndex: 2, reaction: null })], [[a, b], [a, b, c]]);
  const added = chooseMissingInputMemes(withBoth, [[a, b], [a, b, c]]);
  assert.equal(added.memes[1].id, 'c');
  assert.equal(added.alternates[0].id, 'b');
  const none = plan([scene(), scene({ reaction: null, inputIndex: 2 })], []);
  assert.equal(none.receipt.missingMemes, 2);
  assert.deepEqual(none.receipt.missingSceneIndexes, [0, 1]);
  const invalidSizes = plan([scene()], [meme('unknown', { width: null }), meme('unknown2', { durationSec: null }), meme('unknown3', { height: 0 })]);
  assert.equal(invalidSizes.receipt.memes.length, 0);
  assert.equal(invalidSizes.receipt.missingMemes, 1);
  assert.deepEqual(memeBox(meme('tall', { width: 100, height: 1000 }), { w: 1920, h: 1080 }), { x: 906, y: 0, w: 108, h: 1080 });
});

test('u3 sfx precedence, UTF-8 FNV-1a, id ordering, source hash seed, lengths and lowest non-overlapping lanes', () => {
  assert.equal(resolveSceneSfx({ sfxCategory: 'alarm', reaction: '웃음' }, '놀람'), 'alarm');
  assert.equal(resolveSceneSfx({ reaction: '웃음' }, '놀람'), 'shock');
  assert.equal(resolveSceneSfx({ reaction: '기대' }), 'notify');
  assert.equal(resolveSceneSfx({ reaction: null }), null);
  assert.equal(fnv1a(''), 0x811c9dc5);
  assert.equal(fnv1a('hello'), 0x4f9f2cab);
  assert.equal(fnv1a('장면#0'), 0x522cbf89);
  assert.equal(pickSfxFile([], 'seed', 0), null);
  const sounds = [sound('laugh-b', 'laugh', 4), sound('laugh-a', 'laugh', 0.4)];
  const scenes = [scene({ endSec: 0.2 }), scene({ startSec: 0.2, endSec: 0.4 }), scene({ startSec: 0.4, endSec: 0.6 })];
  const p = plan(scenes, [], sounds);
  assert.equal(p.receipt.sfx.length, 3);
  for (const [i, s] of p.receipt.sfx.entries()) {
    assert.equal(s.id, pickSfxFile([...sounds].reverse(), table(scenes).hash.slice(0, 16), i).id);
    assert.ok(s.dur === 0.4 || s.dur === 1.5);
    assert.equal(s.at, i * 0.2);
  }
  assert.ok(tracks(p, 'sfx').length >= 2);
  for (const track of tracks(p, 'sfx')) for (let i = 1; i < track.clips.length; i++) assert.ok(track.clips[i].at >= track.clips[i - 1].at + track.clips[i - 1].time[1]);
  assert.deepEqual(plan(scenes, [], [...sounds].reverse()), p, 'input library ordering cannot change the result');
  assert.equal(plan([scene({ reaction: null, sfxCategory: 'alarm' })], [], sounds).receipt.sfx.length, 0);
  const byMeme = plan([scene({ reaction: null })], [meme('wow', { emotion: '놀람' })], [sound('shock', 'shock')]);
  assert.equal(byMeme.receipt.sfx[0].id, 'shock');
  assert.ok(!clips(p, 'sfx').some(c => /intro/.test(c.id)));
});

for (const [name, options, candidates, expectedAt] of [
  ['before', { memeBefore: true }, [a, b], 2],
  ['after', { memeAfter: true }, [a, b], 3],
  ['both', { memeBefore: true, memeAfter: true }, [a, b], 2],
  ['alternate shortage', { memeBefore: true, memeAfter: true }, [a], 3],
  ['missing-input fallback', { reaction: null }, [a], 3],
  ['short meme', { memeAfter: true }, [meme('short', { durationSec: 0.6 })], 4.4],
  ['no meme', {}, [], 2],
]) {
  test(`sfx starts with the first placed meme, or the scene without one: ${name}`, () => {
    const scenes = [scene({ reaction: null }), scene({ inputIndex: 2, endSec: 3, ...options })];
    const sounds = [sound('laugh', 'laugh', 1.5)];
    const compile = () => planFilm(table(scenes), library(candidates, sounds), (_, i) => i === 1 ? candidates : [], { stage });
    const p = compile();
    const effect = p.receipt.sfx.find(s => s.scene === 2);
    const firstMeme = p.receipt.memes.find(m => m.scene === 2);
    assert.equal(effect.at, expectedAt);
    assert.equal(effect.at, firstMeme?.at ?? 2);
    assert.equal(clips(p, 'sfx').find(c => c.id === 'make-sfx-2').at, expectedAt);
    assert.deepEqual(compile(), p, 'identical inputs produce identical timing and selections');
  });
}

test('delayed sfx may cross a scene boundary; overlapping sounds get separate lanes and repeat identically', async t => {
  const root = await project(t);
  const scenes = [scene({ endSec: 3, memeAfter: true }), scene({ inputIndex: 2, memeBefore: true })];
  const candidates = [meme('short-a', { durationSec: 0.4 }), meme('short-b', { durationSec: 0.4 })];
  const p = plan(scenes, candidates, [sound('laugh', 'laugh', 1.5)]);
  assert.deepEqual(p.receipt.sfx.map(s => [s.at, s.dur]), [[2.6, 1.5], [3, 1.5]]);
  assert.equal(tracks(p, 'sfx').length, 2);
  await applyMake(root, p);
  const bytes = await readFile(join(root, 'film.html'), 'utf8');
  const written = (await film(root)).tracks.flatMap(t => t.clips).filter(c => c.attrs?.['data-u3-make'] === 'sfx');
  assert.deepEqual(written.map(c => c.at).sort((a, b) => a - b), [2.6, 3]);
  await applyMake(root, plan(scenes, candidates, [sound('laugh', 'laugh', 1.5)]));
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), bytes);
});

test('make reruns byte-for-byte on a hand-written film without an explicit body', async t => {
  const root = await project(t);
  await writeFile(join(root, 'film.html'), '<meta name="viewport" content="width=1080, height=1920">\n');
  const p = plan([scene()]);
  await applyMake(root, p);
  const first = await readFile(join(root, 'film.html'), 'utf8');
  await applyMake(root, p);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), first);
});

test('atomic apply reuses tracks and flags, preserves human make-up ids, avoids id collisions and reruns byte-for-byte', async t => {
  const root = await project(t);
  const p = plan([scene({ memeBefore: true, memeAfter: true })], [a, b], [sound('laugh')]);
  await applyMake(root, p);
  let value = await film(root);
  assert.deepEqual(value.tracks.map(t => t.clips[0].attrs?.['data-u3-make'] ?? 'human'), ['subtitle', 'meme', 'meme', 'source', 'sfx', 'human']);
  assert.equal(value.tracks.at(-1).clips[0].id, 'make-up');
  assert.ok(value.tracks.slice(0, -1).every(t => t.clips.every(c => Object.hasOwn(c.attrs, 'data-u3-make'))));
  const before = await readFile(join(root, 'film.html'), 'utf8');
  await applyMake(root, p);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
  value = await film(root);
  value.tracks[1].hidden = true;
  value.tracks[1].muted = true;
  value.tracks.at(-1).locked = true;
  value.tracks.find(t => t.clips[0].attrs?.['data-u3-make'] === 'source').clips[0].id = 'old-source';
  value.tracks.at(-1).clips.push({ id: 'make-source-1', src: 'person.mp4', at: 10, time: [0, 1] });
  await changeProjectFilm(root, () => ({ value }));
  await applyMake(root, p);
  value = await film(root);
  assert.equal(value.tracks[1].hidden, true);
  assert.equal(value.tracks[1].muted, true);
  assert.equal(value.tracks.at(-1).locked, true);
  assert.ok(value.tracks.flatMap(t => t.clips).some(c => c.id === 'make-source-1-b'));
  assert.equal(value.tracks.at(-1).clips[1].src, 'person.mp4');
  const collided = await readFile(join(root, 'film.html'), 'utf8');
  await applyMake(root, p);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), collided);
  await applyMake(root, plan([scene()], []));
  assert.equal((await film(root)).tracks.length, 3, 'unused generated meme/sfx tracks disappear');
});

test('locked owned clips reject all changes, including ownership with empty value; stale plans fail atomically', async t => {
  const root = await project(t, { stage, tracks: [{ locked: true, clips: [{ id: 'anything', src: 'a.mp4', time: [0, 2], attrs: { 'data-u3-make': '' } }] }] });
  const before = await readFile(join(root, 'film.html'), 'utf8');
  await assert.rejects(applyMake(root, plan([scene()])), /locked/);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
  const dir = await fakeLibrary(t);
  await assert.rejects(makeFilm(root, { scenes: 'scenes.json' }, { probe: measure, dir, search: ruleSearch }), /locked/);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
  const other = await project(t);
  const human = await readFile(join(other, 'film.html'), 'utf8');
  await assert.rejects(applyMake(other, plan([scene()]), { expected: 'old bytes' }), /changed during make/);
  assert.equal(await readFile(join(other, 'film.html'), 'utf8'), human);
});

test('a human clip on a generated track survives even when it overlaps the replacement', async t => {
  const root = await project(t);
  await applyMake(root, plan([scene()]));
  const value = await film(root);
  const track = value.tracks.find(t => t.clips[0].attrs?.['data-u3-make'] === 'source');
  track.clips.push({ id: 'human', src: 'person.mp4', at: 4, time: [0, 4] });
  await writeFile(join(root, 'film.html'), filmHtml(value));
  await applyMake(root, plan([scene({ endSec: 6 })]));
  const changed = await film(root);
  assert.ok(changed.tracks.flatMap(t => t.clips).some(c => c.id === 'human' && c.at === 4));
  const before = await readFile(join(root, 'film.html'), 'utf8');
  await applyMake(root, plan([scene({ endSec: 6 })]));
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
});

async function indexFor(dir, memes, stale = false) {
  await mkdir(join(dir, 'meme-embed'), { recursive: true });
  await writeFile(join(dir, 'meme-embed/bge-m3.json'), JSON.stringify({ model: 'bge-m3', dim: 1, items: memes.map(m => ({ id: m.id, docHash: stale ? '0'.repeat(16) : memeDocHash(memeDoc(m)) })) }));
  const data = Buffer.alloc(memes.length * 4);
  memes.forEach((_, i) => data.writeFloatLE(i + 1, i * 4));
  await writeFile(join(dir, 'meme-embed/bge-m3.f32'), data);
}
const readyStore = { root: '/unused', ready: async () => true, status: async () => ({ state: 'ready' }) };

test('mode requires modules, verified model, valid index and matching docHash before queries', async t => {
  const dir = await fakeLibrary(t);
  const memes = await listMemes(dir);
  const search = memeSearch({ store: readyStore, embedder: { embed: async () => new Float32Array([1]) } });
  assert.equal((await rankMode(memes, dir, ruleSearch)).mode, 'rule');
  assert.equal((await rankMode(memes, dir, { status: async () => ({ available: true, state: 'missing' }) })).mode, 'rule');
  assert.match((await rankMode(memes, dir, search)).reason, /색인/);
  await indexFor(dir, memes, true);
  assert.match((await rankMode(memes, dir, search)).reason, /docHash/);
  await indexFor(dir, memes);
  assert.equal((await rankMode(memes, dir, search)).mode, 'embedding');
  const embedded = await rankMemes({ query: '장면' }, memes, 3, {}, dir, search, 'embedding');
  assert.equal(embedded[0].meme.id, 'c');
  assert.equal((await rankMemes({ query: '장면' }, memes, 3, {}, dir, ruleSearch, 'rule'))[0].meme.id, 'a');
});

test('make end-to-end excludes renamed human memes, keeps its own previous picks, copies assets and repeats identically', async t => {
  const root = await project(t);
  const dir = await fakeLibrary(t, [a, b, c], [sound('laugh')]);
  await copyFile(join(dir, 'memes/laugh/a.mp4'), join(root, 'renamed.mp4'));
  const original = await film(root);
  original.tracks.push({ clips: [{ id: 'person-meme', src: 'renamed.mp4', time: [0, 1] }] });
  await writeFile(join(root, 'film.html'), filmHtml(original));
  await save(root, { inputs: ['a.mp4', 'b.mp4'], scenes: [scene({ memeBefore: true, memeAfter: true }), scene({ inputIndex: 2, reaction: null })] });
  const first = await makeFilm(root, { scenes: 'scenes.json' }, { probe: measure, dir, search: ruleSearch });
  assert.deepEqual(first.memes.map(m => m.id), ['b', 'c']);
  assert.equal(first.rankMode, 'rule');
  assert.equal(first.missingMemes, 1);
  assert.equal(first.scenes, 2);
  assert.equal(first.duration, 4);
  assert.match(first.warning, /data-u3-make/);
  const before = await readFile(join(root, 'film.html'), 'utf8');
  assert.match(before, /muted/);
  assert.deepEqual(await makeFilm(root, { scenes: 'scenes.json' }, { probe: measure, dir, search: ruleSearch }), first);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
  assert.equal(await readFile(join(root, 'assets/video/memes/b.mp4'), 'utf8'), 'meme-b');
  assert.equal(await readFile(join(root, 'assets/audio/sfx/laugh.mp3'), 'utf8'), 'sound-laugh');
  const page = await readFile(join(root, 'scenes/u3-subtitle-make.html'), 'utf8');
  assert.match(page, /width: 1080px; height: 1920px/);
  assert.ok((await film(root)).tracks.flatMap(t => t.clips).some(c => c.id === 'make-up'));
});

test('a mid-run embedding failure restarts every scene in rule mode; successful runs remain embedding', async t => {
  const root = await project(t);
  const dir = await fakeLibrary(t);
  const memes = await listMemes(dir);
  await indexFor(dir, memes);
  await save(root, { inputs: ['a.mp4', 'b.mp4'], scenes: [scene({ caption: '첫째' }), scene({ inputIndex: 2, caption: '둘째' })] });
  let queries = 0;
  const search = memeSearch({ store: readyStore, embedder: { embed: async () => { if (++queries === 2) throw new Error('injected failure'); return new Float32Array([1]); } } });
  const fallback = await makeFilm(root, { scenes: 'scenes.json' }, { probe: measure, dir, search });
  assert.equal(queries, 2);
  assert.equal(fallback.rankMode, 'rule');
  assert.match(fallback.rankReason, /실행 전체를 rule로 재계산/);
  assert.deepEqual(fallback.memes.map(m => m.id), ['a', 'b'], 'no c pick from the first embedded query survives');
  const bytes = await readFile(join(root, 'film.html'), 'utf8');
  await makeFilm(root, { scenes: 'scenes.json' }, { probe: measure, dir, search: ruleSearch });
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), bytes);
  const success = memeSearch({ store: readyStore, embedder: { embed: async () => new Float32Array([1]) } });
  const first = await makeFilm(root, { scenes: 'scenes.json' }, { probe: measure, dir, search: success });
  assert.equal(first.rankMode, 'embedding');
  assert.deepEqual(first.memes.map(m => m.id), ['c', 'b']);
  const embeddedBytes = await readFile(join(root, 'film.html'), 'utf8');
  assert.deepEqual(await makeFilm(root, { scenes: 'scenes.json' }, { probe: measure, dir, search: success }), first);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), embeddedBytes);
});

test('missing library errors give the fetch command; an empty library completes with missing counts', async t => {
  const root = await project(t);
  const before = await readFile(join(root, 'film.html'), 'utf8');
  await assert.rejects(makeFilm(root, { scenes: 'scenes.json' }, { probe: measure, dir: join(root, 'no-library'), search: ruleSearch }), /fetch-library.mjs/);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
  const dir = await fakeLibrary(t, []);
  const result = await makeFilm(root, { scenes: 'scenes.json' }, { probe: measure, dir, search: ruleSearch });
  assert.equal(result.missingMemes, 1);
  assert.deepEqual(result.memes, []);
});

test('get make is always offered locally; missing scenes is rejected before provider selection', async t => {
  const root = await project(t);
  assert.equal((await catalog('make')).note, null);
  assert.equal((await catalog('make')).verbs[0].options.scenes.required, true);
  assert.ok((await catalog()).verbs.some(v => v.verb === 'make'));
  await assert.rejects(runGet(root, 'make', {}), /--scenes/);
  await assert.rejects(runGet(root, 'make', { scenes: 'missing.json' }, { via: 'no-provider' }), /장면표/);
});

test('media ends never round above the file boundary at film.html millisecond precision', () => {
  const p = plan([scene()], [meme('fractional', { durationSec: 1.066667 })], [sound('fractional', 'laugh', 0.4125)]);
  assert.equal(clips(p, 'meme')[0].time[1], 1.066);
  assert.equal(clips(p, 'sfx')[0].time[1], 0.412);
  assert.equal(p.receipt.memes[0].at, 0.934, 'end placement uses the serialized duration');
});

test('source trims ending exactly at fractional probe duration remain inside the file and cues stay gapless', () => {
  const value = table([scene({ startSec: 0.3, endSec: 2.066667 }), scene({ inputIndex: 2, endSec: 1 })]);
  value.inputs[0].duration = 2.066667;
  const p = planFilm(value, library([]), () => [], { stage });
  assert.deepEqual(clips(p, 'source').map(c => [c.at, c.time]), [[0, [0.3, 2.066]], [1.766, [0, 1]]]);
  assert.deepEqual(clips(p, 'subtitle').map(c => [c.at, c.time[1]]), [[0, 1.766], [1.766, 1]]);
  assert.equal(p.receipt.duration, 2.766);
});

test('make clamps rounded library sidecar durations to the selected files measured duration before writing', async t => {
  const root = await project(t);
  const dir = await fakeLibrary(t, [meme('rounded', { durationSec: 1.067 })], [sound('rounded', 'laugh', 0.413)]);
  const probe = async (_root, src) => src.startsWith('memes/') ? { duration: 1.066667, width: 400, height: 200 }
    : src.startsWith('sfx/') ? { duration: 0.4125 } : measure();
  const result = await makeFilm(root, { scenes: 'scenes.json' }, { probe, dir, search: ruleSearch });
  assert.equal(result.memes[0].dur, 1.066);
  assert.equal(result.sfx[0].dur, 0.412);
  assert.match(await readFile(join(root, 'film.html'), 'utf8'), /rounded.mp4#t=0,1.066/);
});

const fitPlan = (value, memes = [], sfx = [], filmStage = stage) => planFilm(value, library(memes, sfx), () => memes, { stage: filmStage });
const squareTable = scenes => ({ ...table(scenes), fit: 'blur', inputs: [{ ...input(), width: 1080, height: 1080 }, input('b.mp4')] });

test('fit defaults to cover and accepts only explicit cover or blur', async t => {
  const root = await project(t);
  assert.equal((await readScenes(root, 'scenes.json', { probe: measure })).fit, 'cover');
  for (const fit of ['cover', 'blur']) {
    await save(root, { fit, inputs: ['a.mp4'], scenes: [scene()] });
    assert.equal((await readScenes(root, 'scenes.json', { probe: measure })).fit, fit);
  }
});

test('invalid fit is a 400 before film changes', async t => {
  const root = await project(t);
  const before = await readFile(join(root, 'film.html'), 'utf8');
  for (const fit of [null, '', 'contain', 'BLUR', 0, false, [], {}]) {
    await save(root, { fit, inputs: ['a.mp4'], scenes: [scene()] });
    await assert.rejects(readScenes(root, 'scenes.json', { probe: measure }), e => {
      assert.equal(e.status, 400);
      assert.equal(e.message, 'fit: cover 또는 blur 여야 합니다');
      return true;
    });
    assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
  }
});

test('absent fit preserves the pre-feature cover film bytes; explicit cover uses the same layout', () => {
  const value = table([scene({ reaction: null })]);
  const p = fitPlan(value);
  const bytes = filmHtml({ stage: p.stage, tracks: p.tracks.map(({ clips }) => ({ clips })) });
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '0ea643aed82d49d4a518fffc46f20b7a0cf237b593deb8a42c1c8e62c91a9d73');
  assert.deepEqual(fitPlan({ ...value, fit: 'cover' }).tracks, p.tracks);
  assert.equal(clips(p, 'backdrop').length, 0);
});

test('blur contains a square source above a padded, dark, muted backdrop and below memes and subtitles', () => {
  const value = squareTable([scene({ memeBefore: true, memeAfter: true })]);
  const original = structuredClone(value);
  const p = fitPlan(value, [a, b], [sound('laugh')]);
  assert.deepEqual(clips(p, 'source')[0].box, { x: 0, y: 420, w: 1080, h: 1080 });
  assert.equal(clips(p, 'source')[0].volume, undefined);
  assert.deepEqual(clips(p, 'backdrop'), [{
    id: 'make-backdrop-1', src: 'a.mp4', at: 0, time: [0, 2],
    box: { x: -516, y: -96, w: 2112, h: 2112 },
    volume: 0, style: 'filter: blur(48px) brightness(0.6)', attrs: { 'data-u3-make': 'backdrop' },
  }]);
  assert.deepEqual(p.tracks.map(t => t.role), ['subtitle', 'meme', 'meme', 'source', 'backdrop', 'sfx']);
  assert.equal(p.receipt.fit, 'blur');
  assert.deepEqual(fitPlan(value, [a, b], [sound('laugh')]), p);
  assert.deepEqual(value, original, 'layout must not mutate its inputs');
  const landscape = fitPlan(squareTable([scene()]), [], [], { w: 1920, h: 1080 });
  assert.deepEqual(clips(landscape, 'source')[0].box, { x: 420, y: 0, w: 1080, h: 1080 });
  assert.deepEqual(clips(landscape, 'backdrop')[0].box, { x: -96, y: -516, w: 2112, h: 2112 });
});

test('blur merges adjacent source and backdrop trims together, including the 0.05 second boundary', () => {
  for (const startSec of [2.4, 2.42, 2.45, 2.451]) {
    const p = fitPlan(squareTable([scene({ startSec: 0.3, endSec: 2.4 }), scene({ startSec, endSec: 5 })]));
    const source = clips(p, 'source'), backdrop = clips(p, 'backdrop');
    assert.equal(source.length, startSec <= 2.45 ? 1 : 2);
    assert.equal(backdrop.length, source.length);
    assert.deepEqual(backdrop.map(c => [c.src, c.at, c.time]), source.map(c => [c.src, c.at, c.time]));
    assert.deepEqual(source[0].time, startSec <= 2.45 ? [0.3, Math.round((5 - startSec + 2.4) * 1000) / 1000] : [0.3, 2.4]);
    assert.equal(clips(p, 'subtitle').length, 2);
  }
});

test('blur uses cover without a backdrop for ratios within one percent, and blur only beyond it', () => {
  for (const width of [560, 562.5, 565, 556.875, 568.125, 556, 569]) {
    const value = { ...table([scene()]), fit: 'blur', inputs: [{ ...input(), width, height: 1000 }] };
    const p = fitPlan(value);
    const needsBackdrop = width < 556.875 || width > 568.125;
    assert.equal(clips(p, 'backdrop').length, needsBackdrop ? 1 : 0, `width ${width}`);
    if (!needsBackdrop) assert.deepEqual(clips(p, 'source')[0].box, clips(fitPlan({ ...value, fit: 'cover' }), 'source')[0].box);
  }
  const mixed = fitPlan({ ...squareTable([scene(), scene({ inputIndex: 2 }), scene({ startSec: 4, endSec: 6 })]), inputs: [
    { ...input(), width: 1080, height: 1080 }, { ...input('b.mp4'), width: 1080, height: 1920 },
  ] });
  assert.deepEqual(clips(mixed, 'backdrop').map(c => [c.id, c.at, c.time]), [['make-backdrop-1', 0, [0, 2]], ['make-backdrop-3', 4, [4, 6]]]);
});

test('blur apply reuses one backdrop track, keeps its flags and human clips, and cover removes only owned backdrops', async t => {
  const root = await project(t);
  const value = squareTable([scene()]);
  const p = fitPlan(value);
  await applyMake(root, p);
  const first = await readFile(join(root, 'film.html'), 'utf8');
  await applyMake(root, fitPlan(value));
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), first);
  let written = await film(root);
  const backdrop = written.tracks.find(t => t.clips.some(c => c.attrs?.['data-u3-make'] === 'backdrop'));
  assert.ok(backdrop);
  backdrop.muted = true;
  backdrop.clips.push({ id: 'human-backdrop', src: 'person.mp4', at: 10, time: [0, 1] });
  await changeProjectFilm(root, () => ({ value: written }));
  await applyMake(root, p);
  written = await film(root);
  const backdrops = written.tracks.filter(t => t.clips.some(c => c.attrs?.['data-u3-make'] === 'backdrop'));
  assert.equal(backdrops.length, 1);
  assert.equal(backdrops[0].muted, true, 'backdrop role must reuse its track rather than become a meme');
  assert.ok(backdrops[0].clips.some(c => c.id === 'human-backdrop'));
  assert.ok(written.tracks.flatMap(t => t.clips).some(c => c.id === 'make-up'));
  const before = await readFile(join(root, 'film.html'), 'utf8');
  await applyMake(root, p);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
  backdrops[0].locked = true;
  await changeProjectFilm(root, () => ({ value: written }));
  const locked = await readFile(join(root, 'film.html'), 'utf8');
  await assert.rejects(applyMake(root, p), /locked/);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), locked);
  backdrops[0].locked = false;
  await changeProjectFilm(root, () => ({ value: written }));
  await applyMake(root, fitPlan({ ...value, fit: 'cover' }));
  written = await film(root);
  assert.equal(written.tracks.flatMap(t => t.clips).filter(c => c.attrs?.['data-u3-make'] === 'backdrop').length, 0);
  assert.ok(written.tracks.flatMap(t => t.clips).some(c => c.id === 'human-backdrop'));
});

test('blur make end-to-end receipts and film repeat byte-for-byte with a single backdrop track', async t => {
  const root = await project(t);
  const dir = await fakeLibrary(t, [a, b], [sound('laugh')]);
  await save(root, { fit: 'blur', inputs: ['a.mp4'], scenes: [scene({ endSec: 1 }), scene({ startSec: 1 })] });
  const options = { probe: measure, dir, search: ruleSearch };
  const first = await makeFilm(root, { scenes: 'scenes.json' }, options);
  assert.equal(first.fit, 'blur');
  const bytes = await readFile(join(root, 'film.html'), 'utf8');
  assert.deepEqual(await makeFilm(root, { scenes: 'scenes.json' }, options), first);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), bytes);
  const written = await film(root);
  const backdrops = written.tracks.filter(t => t.clips.some(c => c.attrs?.['data-u3-make'] === 'backdrop'));
  assert.equal(backdrops.length, 1);
  assert.equal(backdrops[0].clips.length, 1);
  assert.equal(backdrops[0].clips[0].style, 'filter: blur(48px) brightness(0.6)');
  assert.equal(backdrops[0].clips[0].volume, 0);
  assert.ok(written.tracks.flatMap(t => t.clips).some(c => c.id === 'make-up'));
});
