import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { filmHtml, readFilmFile } from '../../src/film-doc.mjs';
import { importSubtitles } from './u3-subtitles.mjs';
import { pagesDir } from './u3-library.mjs';

const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v Sumin>첫 <00:00:01.400>줄 *그대로* &amp; \\*별표\\*</v>\n\n00:00:02.500 --> 00:00:04.000\n둘째 줄\n';
async function project(t) {
  const root = await mkdtemp(join(tmpdir(), 'of-u3-subtitles-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'film.html'), filmHtml({ stage: { w: 1080, h: 1920 }, tracks: [{ clips: [{ id: 'footage', src: 'footage.mp4', time: [0, 10] }] }] }));
  await writeFile(join(root, 'input.vtt'), vtt);
  return root;
}
const film = async root => readFilmFile(await readFile(join(root, 'film.html'), 'utf8')).value;

test('one clip per cue: local times, overlap trim, literal stars, props, fonts and repeatable layer replacement', async t => {
  const root = await project(t);
  const first = await importSubtitles(root, { src: 'input.vtt' });
  assert.deepEqual(first, { layer: 'layer1', page: 'scenes/u3-subtitle-layer1.html', clips: ['u3sub-layer1-1', 'u3sub-layer1-2'], count: 2 });
  const value = await film(root);
  assert.equal(value.tracks.length, 2);
  assert.equal(value.tracks[0].clips[0].id, 'footage');
  const [a, b] = value.tracks[1].clips;
  assert.deepEqual([a.at, a.time, b.at, b.time], [1, [0, 1.5], 2.5, [0, 1.5]]);
  assert.equal(a.overrides[0].text, '첫 줄 \\*그대로\\* & \\*별표\\*');
  assert.equal(a.overrides[1].text, '');
  assert.deepEqual(JSON.parse(a.attrs['data-props']).map(p => p.name), ['메인', '서브', '튀어나옴', '떠오름', '흔들림', '색', '크기', '강조색']);
  assert.deepEqual(await readdir(join(root, 'scenes/fonts')), await readdir(join(pagesDir(), 'fonts')));
  const before = await readFile(join(root, 'film.html'), 'utf8');
  assert.deepEqual(await importSubtitles(root, { src: 'input.vtt' }), first);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);

  await importSubtitles(root, { src: 'input.vtt', layer: 'layer1-extra' });
  await writeFile(join(root, first.page), '<!-- layer style edited by the person -->');
  await writeFile(join(root, 'scenes/fonts/Pretendard-Regular.otf'), 'custom font');
  await writeFile(join(root, 'input.vtt'), 'WEBVTT\n\n00:01.000 --> 00:02.000\n새 글\n');
  await importSubtitles(root, { src: 'input.vtt' });
  const changed = await film(root);
  assert.equal(changed.tracks.length, 3);
  assert.equal(changed.tracks[1].clips.length, 1);
  assert.equal(changed.tracks[1].clips[0].overrides[0].text, '새 글');
  assert.equal(changed.tracks[2].clips.length, 2, 'another layer stays on its track');
  assert.equal(await readFile(join(root, first.page), 'utf8'), '<!-- layer style edited by the person -->');
  assert.equal(await readFile(join(root, 'scenes/fonts/Pretendard-Regular.otf'), 'utf8'), 'custom font');
});

test('invalid layer, outside source, empty cues and coincident starts leave film.html alone', async t => {
  const root = await project(t);
  const before = await readFile(join(root, 'film.html'), 'utf8');
  await assert.rejects(importSubtitles(root, { src: 'input.vtt', layer: '../outside' }), /layer must/);
  await assert.rejects(importSubtitles(root, { src: '../outside.vtt' }), /inside the project/);
  await writeFile(join(root, 'input.vtt'), 'WEBVTT\n');
  await assert.rejects(importSubtitles(root, { src: 'input.vtt' }), /no subtitle cues/);
  await writeFile(join(root, 'input.vtt'), vtt.replace('00:00:02.500', '00:00:01.000'));
  await assert.rejects(importSubtitles(root, { src: 'input.vtt' }), /distinct nonnegative starts/);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), before);
});

test('template emphasis follows u3: nonempty pairs, escaped stars, unmatched stars and literal HTML', async () => {
  const template = await readFile(join(pagesDir(), 'u3-subtitle.html'), 'utf8');
  const script = template.match(/<script>([\s\S]*?)<\/script>/)[1];
  const context = { window: {}, document: { getElementById: () => ({}), fonts: { load: () => Promise.resolve() } }, MutationObserver: class { observe() {} } };
  const runs = runInNewContext(`${script}\ncaptionRuns`, context);
  const plain = value => JSON.parse(JSON.stringify(runs(value)));
  assert.deepEqual(plain('앞 *강조* 뒤 \\*글자\\*'), [{ text: '앞 ', highlight: false }, { text: '강조', highlight: true }, { text: ' 뒤 *글자*', highlight: false }]);
  assert.deepEqual(plain('** 혼자*'), [{ text: '*', highlight: false }, { text: ' 혼자', highlight: true }]);
  assert.deepEqual(plain('끝*'), [{ text: '끝*', highlight: false }]);
  assert.deepEqual(plain('<img src=x>'), [{ text: '<img src=x>', highlight: false }]);
});
