import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterU3Memes, filterU3Sfx, mergeU3MemePage, U3_MEME_EMOTIONS, u3Categories, u3DragItem, u3Emotions, u3MemeBox, u3MemeDragItem, type U3Meme, type U3MemePage, type U3Sfx } from './u3-library.ts';

const ITEMS: U3Sfx[] = [
  { id: 'sfx-1', category: 'shock', title: 'VINE BOOM SOUND', durationSec: 1.2 },
  { id: 'sfx-2', category: 'pop', title: 'Pop SFX', durationSec: 0.3 },
  { id: 'sfx-3', category: 'pop', title: '뿡', durationSec: null },
  { id: 'sfx-4', category: 'fail', title: 'Sad Trombone', durationSec: 2 },
];

test('the categories, each once, in name order', () => {
  assert.deepEqual(u3Categories(ITEMS), ['fail', 'pop', 'shock']);
});

test('found by name, category or id, in one category or all', () => {
  assert.deepEqual(filterU3Sfx(ITEMS, '', '').map((i) => i.id), ['sfx-1', 'sfx-2', 'sfx-3', 'sfx-4']);
  assert.deepEqual(filterU3Sfx(ITEMS, 'boom', '').map((i) => i.id), ['sfx-1']);
  assert.deepEqual(filterU3Sfx(ITEMS, '  POP ', '').map((i) => i.id), ['sfx-2', 'sfx-3'], 'the category counts, any case');
  assert.deepEqual(filterU3Sfx(ITEMS, '', 'pop').map((i) => i.id), ['sfx-2', 'sfx-3']);
  assert.deepEqual(filterU3Sfx(ITEMS, '뿡', 'pop').map((i) => i.id), ['sfx-3']);
  assert.deepEqual(filterU3Sfx(ITEMS, 'boom', 'pop'), []);
  assert.deepEqual(filterU3Sfx(ITEMS, 'sfx-4', '').map((i) => i.id), ['sfx-4']);
});

test('a sound dragged: an audio clip of its length, where it will land, carrying its id', () => {
  assert.deepEqual(u3DragItem(ITEMS[0]), {
    path: 'assets/audio/sfx/sfx-1.mp3', name: 'VINE BOOM SOUND', kind: 'audio', dir: 'assets/audio/sfx', size: 0, mtimeMs: 0,
    durationMs: 1200, u3Library: 'sfx-1',
  });
  const unknown = u3DragItem(ITEMS[2]);
  assert.equal(unknown.durationMs, undefined, 'no length known: the timeline draws its own');
  assert.equal(unknown.kind, 'audio');
  assert.equal(unknown.u3Library, 'sfx-3');
});

const MEMES: U3Meme[] = [
  { id: 'giphy-1', emotion: '당황', situations: ['황당함', '어이없음'], description: '남자가 눈을 크게 뜬다', durationSec: 2.5, width: 480, height: 270 },
  { id: 'tenor-2', emotion: '웃음', situations: ['폭소'], description: 'Cat laughing', durationSec: null, width: 320, height: 320 },
  { id: 'tenor-3', emotion: '당황', situations: [], description: '', durationSec: 1, width: null, height: null },
];

test('all fourteen emotions are available before loading any meme page', () => {
  assert.equal(U3_MEME_EMOTIONS.length, 14);
  assert.equal(new Set(U3_MEME_EMOTIONS).size, 14);
  assert.ok(U3_MEME_EMOTIONS.includes('놀람'));
});

test('meme pages append in server order without duplicates or changing the earlier page', () => {
  const first: U3MemePage = { dir: '/library', items: [MEMES[1], MEMES[0]], total: 3, next: 2 };
  const last: U3MemePage = { dir: '/library', items: [MEMES[0], MEMES[2]], total: 3, next: null };
  const joined = mergeU3MemePage(first, last, 2);
  assert.deepEqual(joined, { ...last, items: [MEMES[1], MEMES[0], MEMES[2]] });
  assert.deepEqual(first.items, [MEMES[1], MEMES[0]]);
  assert.equal(mergeU3MemePage(joined, last, 2), joined, 'a repeated response is not appended');
  assert.equal(mergeU3MemePage(first, last, 4), first, 'an unexpected page cannot leave a gap');
  assert.equal(mergeU3MemePage(null, last, 2), null, 'there must be a first page');
});

test('offset zero resets items, total and next for another query or emotion, even to no results', () => {
  const previous: U3MemePage = { dir: '/library', items: MEMES, total: 30, next: 3 };
  const first: U3MemePage = { dir: '/library', items: [MEMES[1]], total: 1, next: null };
  assert.deepEqual(mergeU3MemePage(previous, first, 0), first);
  assert.deepEqual(mergeU3MemePage(null, first, 0), first);
  const empty: U3MemePage = { dir: null, items: [], total: 0, next: null };
  assert.deepEqual(mergeU3MemePage(previous, empty, 0), empty);
  assert.deepEqual(previous.items, MEMES);
});

test('the memes\' emotions, each once, in name order', () => {
  assert.deepEqual(u3Emotions(MEMES), ['당황', '웃음']);
});

test('memes found by description, situation, emotion or id, in one emotion or all', () => {
  assert.deepEqual(filterU3Memes(MEMES, '', '').map((i) => i.id), ['giphy-1', 'tenor-2', 'tenor-3']);
  assert.deepEqual(filterU3Memes(MEMES, '', '당황').map((i) => i.id), ['giphy-1', 'tenor-3']);
  assert.deepEqual(filterU3Memes(MEMES, '어이없', '').map((i) => i.id), ['giphy-1'], 'a situation');
  assert.deepEqual(filterU3Memes(MEMES, ' CAT ', '').map((i) => i.id), ['tenor-2'], 'the description, any case');
  assert.deepEqual(filterU3Memes(MEMES, '웃음', '당황'), []);
  assert.deepEqual(filterU3Memes(MEMES, 'tenor-3', '').map((i) => i.id), ['tenor-3']);
});

test('a meme dropped: 60% of the stage\'s width, in its own shape, centered', () => {
  assert.deepEqual(u3MemeBox({ w: 480, h: 270 }, { w: 1080, h: 1920 }), { x: 216, y: 778, w: 648, h: 365 });
  assert.deepEqual(u3MemeBox({ w: 320, h: 320 }, { w: 1920, h: 1080 }), { x: 420, y: 0, w: 1080, h: 1080 }, 'taller than the stage: as high as it is');
  assert.deepEqual(u3MemeBox({ w: 400, h: 200 }, { w: 1920, h: 1080 }), { x: 384, y: 252, w: 1152, h: 576 });
  assert.equal(u3MemeBox({}, { w: 1920, h: 1080 }), null, 'its size not known');
  assert.equal(u3MemeBox({ w: 4, h: 3 }, null), null, 'the stage not known');
});

test('a meme dragged: a video clip of its length and size, where it will land, carrying its id', () => {
  assert.deepEqual(u3MemeDragItem(MEMES[0]), {
    path: 'assets/video/memes/giphy-1.mp4', name: 'giphy-1', kind: 'video', dir: 'assets/video/memes', size: 0, mtimeMs: 0,
    durationMs: 2500, w: 480, h: 270, u3Library: 'giphy-1',
  });
  const bare = u3MemeDragItem(MEMES[2]);
  assert.equal(bare.w, undefined);
  assert.equal(bare.durationMs, 1000);
});
