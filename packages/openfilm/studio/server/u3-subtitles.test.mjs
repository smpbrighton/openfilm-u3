import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { filmHtml, readFilmFile } from '../../src/film-doc.mjs';
import { importSubtitles } from './u3-subtitles.mjs';
import { pagesDir } from './u3-library.mjs';
import { filmCaptions } from './captions.mjs';
import { catalog, runGet } from './get.mjs';

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
  assert.equal(value.tracks[1].clips[0].id, 'footage');
  const [a, b] = value.tracks[0].clips;
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
  assert.equal(changed.tracks[0].clips.length, 2, 'another layer stays on its track');
  assert.equal(changed.tracks[2].clips[0].id, 'footage', 'subtitle tracks are above footage');
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

test('get subtitles is offered without a provider and dispatches locally', async t => {
  const root = await project(t);
  assert.equal((await catalog('subtitles')).note, null);
  assert.ok((await catalog()).verbs.some(v => v.verb === 'subtitles'));
  const result = JSON.parse(await runGet(root, 'subtitles', { src: 'input.vtt', layer: 'main' }, { via: 'no-provider' }));
  assert.equal(result.count, 2);
  assert.equal(result.layer, 'main');
  await assert.rejects(runGet(root, 'subtitles', {}), /--src/);
});

test('u3 clips suppress every Studio cue without changing transcripts or subtitle settings', async t => {
  const root = await project(t);
  const settings = '{"on":true,"font":"custom"}';
  await writeFile(join(root, 'subtitles.json'), settings);
  await writeFile(join(root, 'footage.vtt'), vtt);
  assert.ok((await filmCaptions(root, { duration: async () => 10 })).cues.length > 0);
  await importSubtitles(root, { src: 'input.vtt' });
  assert.deepEqual(await filmCaptions(root), { cues: [], sourceLanguage: null, languages: [], untranscribed: [] });
  assert.equal(await readFile(join(root, 'subtitles.json'), 'utf8'), settings);
  assert.equal(await readFile(join(root, 'footage.vtt'), 'utf8'), vtt);
});

test('a layer page is laid out at the film\'s own stage: a landscape film gets a 1920 × 1080 page, not a portrait one', async t => {
  const root = await mkdtemp(join(tmpdir(), 'of-u3-subtitles-wide-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'film.html'), filmHtml({ stage: { w: 1920, h: 1080 }, tracks: [{ clips: [{ id: 'footage', src: 'footage.mp4', time: [0, 10] }] }] }));
  await writeFile(join(root, 'input.vtt'), vtt);
  const { page } = await importSubtitles(root, { src: 'input.vtt' });
  const html = await readFile(join(root, page), 'utf8');
  assert.match(html, /width:\s*1920px;\s*height:\s*1080px/, 'the page body is the stage');
  assert.match(html, /width:\s*1920,\s*height:\s*1080/, 'window.film says the stage');
  assert.doesNotMatch(html, /1080px;\s*height:\s*1920px|width:\s*1080,\s*height:\s*1920/, 'nothing of the portrait template is left');
});

test('with subtitle clips Studio draws no cues, but what is not transcribed yet is still listed, for 자막 만들기', async t => {
  const root = await mkdtemp(join(tmpdir(), 'of-u3-subtitles-asr-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'film.html'), filmHtml({ stage: { w: 1920, h: 1080 }, tracks: [{ clips: [{ id: 'voice', src: 'voice.mp3', time: [0, 4] }] }] }));
  await writeFile(join(root, 'voice.mp3'), 'not really audio');
  await writeFile(join(root, 'input.vtt'), vtt);
  const before = await filmCaptions(root, { duration: async () => 4 });
  assert.deepEqual(before.untranscribed, ['voice.mp3'], 'the recording is waiting for its transcript');
  await importSubtitles(root, { src: 'input.vtt' });
  const after = await filmCaptions(root, { duration: async () => 4 });
  assert.deepEqual(after.cues, [], 'no Studio cues beside the subtitle clips');
  assert.deepEqual(after.untranscribed, ['voice.mp3'], '자막 만들기 still finds the recording');
});
