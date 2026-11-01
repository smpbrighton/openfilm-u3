import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterU3Sfx, u3Categories, u3DragItem, type U3Sfx } from './u3-library.ts';

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
