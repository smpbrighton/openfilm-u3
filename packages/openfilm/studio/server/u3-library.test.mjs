import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  descriptionScore, libraryDir, listMemes, listSfx, matchMemes, memeById, memesInFilm, noLibrary, noMemes, placeMeme, placeSfx, rankSfx,
  scoreMeme, sfxById, sfxSituationScore, u3ProjectRoute, u3Route,
} from './u3-library.mjs';

/** A library in a temporary folder: `sounds` as [category, id, title, bytes]. */
function fakeLibrary(sounds) {
  const dir = mkdtempSync(join(tmpdir(), 'of-u3-lib-'));
  for (const [category, id, title, bytes = id] of sounds) {
    mkdirSync(join(dir, 'sfx', category), { recursive: true });
    writeFileSync(join(dir, 'sfx', category, `${id}.mp3`), bytes);
    writeFileSync(join(dir, 'sfx', category, `${id}.json`), JSON.stringify({ id, kind: 'sfx', category, file: `${id}.mp3`, title, source: 'https://example.com', license: 'test', durationSec: 0.5 }));
  }
  return dir;
}

/** Memes in the library at `dir`: [folder, { id, ...sidecar }, bytes]. */
function addMemes(dir, memes) {
  for (const [folder, meta, bytes = meta.id] of memes) {
    mkdirSync(join(dir, 'memes', folder), { recursive: true });
    writeFileSync(join(dir, 'memes', folder, `${meta.id}.mp4`), bytes);
    writeFileSync(join(dir, 'memes', folder, `${meta.id}.json`), JSON.stringify({ situations: [], tagsConfirmed: false, importedAt: '2026-09-01T00:00:00.000Z', durationSec: 2, width: 320, height: 240, sourceUrl: 'https://example.com', ...meta }));
  }
  return dir;
}

const MEMES = [
  ['confused', { id: 'giphy-old', emotion: '당황', importedAt: '2026-01-01T00:00:00.000Z', description: '남자가 고개를 갸웃한다' }, 'old-bytes'],
  ['confused', { id: 'tenor-new', emotion: '당황', importedAt: '2026-09-01T00:00:00.000Z' }, 'new-bytes'],
  ['surprised', { id: 'tenor-wow', emotion: '놀람', situations: ['깜짝 놀라는'], tagsConfirmed: true }, 'wow-bytes!'],
  ['laugh', { id: 'giphy-lol', emotion: '웃음', width: 400, height: 200 }, 'lol-bytes'],
];

const SOUNDS = [
  ['shock', 'sfx-b-shock', 'Crowd Shocked'],
  ['reveal', 'sfx-a-reveal', 'Ta-da'],
  ['pop', 'sfx-c-pop', 'pop'],
  ['pop', 'sfx-d-pop', 'pop'],
];
const made = [];
const library = (sounds = SOUNDS) => { const dir = fakeLibrary(sounds); made.push(dir); return dir; };
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

test('the library is OPENFILM_U3_LIBRARY, else u3/library of this checkout', () => {
  assert.equal(libraryDir({ OPENFILM_U3_LIBRARY: '/opt/lib' }), resolve('/opt/lib'));
  assert.equal(libraryDir({}), resolve(import.meta.dirname, '../../../../u3/library'));
});

test('the bundled library: 82 sounds in 11 categories, in id order, each with its file', async () => {
  const items = await listSfx(libraryDir({}));
  assert.equal(items.length, 82);
  assert.equal(new Set(items.map((i) => i.category)).size, 11);
  assert.deepEqual(items.map((i) => i.id), items.map((i) => i.id).sort());
  for (const item of items) assert.ok(statSync(item.path).size > 0, item.id);
});

test('u3\'s scores: 놀람 is shock first, 반전 is reveal or shock first, one prompt one file', async () => {
  const items = await listSfx(libraryDir({}));
  assert.equal(rankSfx('놀람', items)[0].item.category, 'shock');
  assert.ok(['reveal', 'shock'].includes(rankSfx('반전', items)[0].item.category));
  assert.equal(rankSfx('놀람', items)[0].item.id, rankSfx('놀람', [...items].reverse())[0].item.id, 'the order they come in does not decide');
  /* the rules one by one */
  assert.equal(sfxSituationScore('놀람', { id: 'x', category: 'shock' }), 20 + 10 + 20);
  assert.equal(sfxSituationScore('반전', { id: 'x', category: 'reveal' }), 20);
  assert.equal(sfxSituationScore('pop', { id: 'x', title: 'Pop SFX', category: 'pop' }), 100);
  assert.equal(sfxSituationScore('뿌듯함', { id: 'x', category: 'applause' }), 10);
  assert.equal(sfxSituationScore('날씨', { id: 'x', category: 'alarm' }), 0);
});

test('equal scores keep id order', async () => {
  const items = await listSfx(library());
  assert.deepEqual(rankSfx('pop', items).slice(0, 2).map((r) => r.item.id), ['sfx-c-pop', 'sfx-d-pop']);
});

test('a library not there is none, and its sentence says where it was looked for', async () => {
  const dir = join(tmpdir(), 'of-u3-no-such-library');
  assert.equal(await listSfx(dir), null);
  await assert.rejects(sfxById('sfx-a', dir), (e) => e.status === 404 && e.message === noLibrary(dir));
  assert.match(noLibrary(dir), /of-u3-no-such-library.*OPENFILM_U3_LIBRARY/);
});

test('a sound is found by its id only: a path out of the library is refused', async () => {
  const dir = library();
  assert.equal((await sfxById('sfx-a-reveal', dir)).category, 'reveal');
  for (const id of ['../x', '../../etc/passwd', 'sfx/shock/sfx-b-shock', '', null]) {
    await assert.rejects(sfxById(id, dir), (e) => e.status === 400, String(id));
  }
  await assert.rejects(sfxById('sfx-nope', dir), (e) => e.status === 404);
  /* a sidecar naming a file elsewhere is no sound of the library */
  writeFileSync(join(dir, 'sfx', 'pop', 'sfx-e.json'), JSON.stringify({ id: 'sfx-e', category: 'pop', file: '../../outside.mp3', title: 'out' }));
  writeFileSync(join(dir, 'outside.mp3'), 'x');
  await assert.rejects(sfxById('sfx-e', dir), (e) => e.status === 404);
  /* nor a link in it to elsewhere */
  const away = mkdtempSync(join(tmpdir(), 'of-u3-away-'));
  made.push(away);
  writeFileSync(join(away, 'secret.mp3'), 'secret');
  symlinkSync(join(away, 'secret.mp3'), join(dir, 'sfx', 'pop', 'sfx-f.mp3'));
  writeFileSync(join(dir, 'sfx', 'pop', 'sfx-f.json'), JSON.stringify({ id: 'sfx-f', category: 'pop', file: 'sfx-f.mp3', title: 'f' }));
  await assert.rejects(sfxById('sfx-f', dir), (e) => e.status === 404 || e.status === 400);
});

test('placing a sound copies it into assets/audio/sfx once: the same file again is the same path', async () => {
  const dir = library();
  const root = mkdtempSync(join(tmpdir(), 'of-u3-project-'));
  made.push(root);
  const first = await placeSfx(root, 'sfx-b-shock', dir);
  assert.equal(first, 'assets/audio/sfx/sfx-b-shock.mp3');
  assert.equal(readFileSync(join(root, first), 'utf8'), 'sfx-b-shock');
  assert.equal(await placeSfx(root, 'sfx-b-shock', dir), first);
  await assert.rejects(placeSfx(root, '../x', dir), (e) => e.status === 400);
});

/* ── memes: u3's scores (tests/core/meme-match.test.ts), as they are there ── */
const meme = (over) => ({ emotion: '기쁨', situations: [], tagsConfirmed: false, importedAt: '2026-09-01T00:00:00.000Z', ...over });

test('meme scores: emotion and situations, and the bonus for tags a person confirmed', () => {
  const visual = { query: '택배 상자를 열고 깜짝 놀라는 반응', reaction: '당황' };
  assert.equal(scoreMeme(visual, meme({ id: 'a', emotion: '당황' })), 10);
  assert.equal(scoreMeme(visual, meme({ id: 'b', emotion: '기쁨', situations: ['당황'] })), 8);
  assert.equal(scoreMeme({ query: '당황한 표정' }, meme({ id: 'c', emotion: '당황' })), 5);
  assert.equal(scoreMeme(visual, meme({ id: 'd', situations: ['깜짝 놀라는'] })), 4);
  assert.equal(scoreMeme(visual, meme({ id: 'e', situations: ['택배 도착'] })), 2);
  assert.equal(scoreMeme(visual, meme({ id: 'f', emotion: '당황', tagsConfirmed: true })), 10.5);
  assert.equal(scoreMeme(visual, meme({ id: 'g', tagsConfirmed: true })), 0);
  assert.equal(scoreMeme({ query: '아 네' }, meme({ id: 'h', situations: ['아이고 네네'] })), 0);
});

test('memes best first, equal scores the newest first, and 0 too when there are not enough', () => {
  const visual = { query: '놀라는 반응', reaction: '당황' };
  const memes = [meme({ id: 'old', emotion: '당황', importedAt: '2026-01-01T00:00:00.000Z' }), meme({ id: 'zero' }), meme({ id: 'new', emotion: '당황', importedAt: '2026-09-01T00:00:00.000Z' }), meme({ id: 'tag', situations: ['놀라는 반응'] })];
  assert.deepEqual(matchMemes(visual, memes).map((item) => item.meme.id), ['new', 'old', 'tag']);
  assert.deepEqual(matchMemes(visual, memes, 10).map((item) => [item.meme.id, item.score]), [['new', 10], ['old', 10], ['tag', 4], ['zero', 0]]);
  assert.deepEqual(matchMemes(visual, memes, 0), []);
  /* the same time: by id */
  assert.deepEqual(matchMemes(visual, [meme({ id: 'b', emotion: '당황' }), meme({ id: 'a', emotion: '당황' })]).map((item) => item.meme.id), ['a', 'b']);
});

test('the description scores by how many two-letter pieces of the scene it has', () => {
  assert.equal(descriptionScore('고개 끄덕이는 반응', '남자가 고개를 끄덕이며 웃음'), 3.6);
  assert.equal(scoreMeme({ query: '고개 끄덕이는 반응' }, meme({ id: 'd', description: '남자가 고개를 끄덕이며 웃음' })), 3.6);
});

test('exclude leaves memes out, recent ones score 6 less', () => {
  const memes = [meme({ id: 'a', emotion: '당황' }), meme({ id: 'b', emotion: '당황' }), meme({ id: 'c' })];
  const result = matchMemes({ query: '놀라는 반응', reaction: '당황' }, memes, 3, { exclude: ['a'], recent: ['b'] });
  assert.deepEqual(result.map((item) => [item.meme.id, item.score]), [['b', 4], ['c', 0]]);
});

/* ── memes: the library ── */

test('memes are read from their sidecars, in id order; one broken or without its mp4 is left out', async () => {
  const dir = addMemes(library(), MEMES);
  writeFileSync(join(dir, 'memes', 'laugh', 'broken.json'), '{ not json');
  writeFileSync(join(dir, 'memes', 'laugh', 'giphy-nofile.json'), JSON.stringify({ id: 'giphy-nofile', emotion: '웃음' }));
  writeFileSync(join(dir, 'memes', 'laugh', 'bad.json'), JSON.stringify({ id: '../x', emotion: '웃음' }));
  const items = await listMemes(dir);
  assert.deepEqual(items.map((i) => i.id), ['giphy-lol', 'giphy-old', 'tenor-new', 'tenor-wow']);
  const wow = items.find((i) => i.id === 'tenor-wow');
  assert.deepEqual({ ...wow, path: undefined }, {
    id: 'tenor-wow', emotion: '놀람', situations: ['깜짝 놀라는'], description: '', durationSec: 2, width: 320, height: 240,
    importedAt: '2026-09-01T00:00:00.000Z', tagsConfirmed: true, sourceUrl: 'https://example.com', path: undefined, size: 10,
  });
  assert.equal(wow.path, join(dir, 'memes', 'surprised', 'tenor-wow.mp4'));
  /* a library with sounds and no memes has none */
  assert.equal(await listMemes(library()), null);
  await assert.rejects(memeById('tenor-wow', library()), (e) => e.status === 404 && /no memes\/.*fetch-library\.mjs/.test(e.message));
  assert.match(noMemes('/x'), /\/x has no memes\/.*gh auth login/);
});

test('the fetched library: 2,195 memes in 14 emotions, each with its file (when fetched)', { skip: !existsSync(join(libraryDir({}), 'memes')) && 'u3/library/memes is not fetched' }, async () => {
  const items = await listMemes(libraryDir({}));
  assert.equal(items.length, 2195);
  assert.equal(new Set(items.map((i) => i.emotion)).size, 14);
  const best = matchMemes({ query: '택배를 열고 깜짝 놀람', reaction: '놀람' }, items, 3);
  assert.equal(best[0].meme.emotion, '놀람');
  assert.deepEqual(best.map((b) => b.meme.id), matchMemes({ query: '택배를 열고 깜짝 놀람', reaction: '놀람' }, [...items].reverse(), 3).map((b) => b.meme.id), 'the order they come in does not decide');
});

test('a meme is found by its id only: a path out of the library is refused', async () => {
  const dir = addMemes(library(), MEMES);
  assert.equal((await memeById('tenor-wow', dir)).emotion, '놀람');
  for (const id of ['../x', '../../etc/passwd', 'memes/surprised/tenor-wow', '', null]) {
    await assert.rejects(memeById(id, dir), (e) => e.status === 400, String(id));
  }
  await assert.rejects(memeById('tenor-nope', dir), (e) => e.status === 404);
  const away = mkdtempSync(join(tmpdir(), 'of-u3-away-'));
  made.push(away);
  writeFileSync(join(away, 'secret.mp4'), 'secret');
  symlinkSync(join(away, 'secret.mp4'), join(dir, 'memes', 'laugh', 'giphy-link.mp4'));
  writeFileSync(join(dir, 'memes', 'laugh', 'giphy-link.json'), JSON.stringify({ id: 'giphy-link', emotion: '웃음' }));
  await assert.rejects(memeById('giphy-link', dir), (e) => e.status === 404 || e.status === 400);
});

const film = (...tracks) => `<!doctype html>\n<html><head><meta name="viewport" content="width=1920, height=1080"></head><body>\n${tracks.map((clips) => `<section>\n${clips.map((src) => `  <video src="${src}"></video>`).join('\n')}\n</section>`).join('\n')}\n</body></html>\n`;

test('memes in a film: its video clips that are a meme by their bytes, a copy under another name too', async () => {
  const dir = addMemes(library(), MEMES);
  const memes = await listMemes(dir);
  const root = mkdtempSync(join(tmpdir(), 'of-u3-film-'));
  made.push(root);
  mkdirSync(join(root, 'assets', 'video', 'memes'), { recursive: true });
  copyFileSync(join(dir, 'memes', 'surprised', 'tenor-wow.mp4'), join(root, 'assets', 'video', 'memes', 'wow.mp4'));
  copyFileSync(join(dir, 'memes', 'confused', 'giphy-old.mp4'), join(root, 'assets', 'video', 'memes', 'renamed copy.mp4'));
  /* the same size as tenor-wow, other bytes: not that one */
  writeFileSync(join(root, 'assets', 'video', 'same-size.mp4'), 'wow-bytes?');
  writeFileSync(join(root, 'assets', 'video', 'footage.mp4'), 'footage of the film');
  const text = film(['assets/video/footage.mp4', 'assets/video/same-size.mp4'], ['assets/video/memes/wow.mp4#t=0,1', 'assets/video/memes/renamed%20copy.mp4', '../outside.mp4', 'https://example.com/x.mp4']);
  assert.deepEqual(await memesInFilm(root, text, memes), ['giphy-old', 'tenor-wow']);
  assert.deepEqual(await memesInFilm(root, 'not a film', memes), []);
  assert.deepEqual(await memesInFilm(root, film(['assets/video/footage.mp4']), memes), []);
});

test('placing a meme copies it into assets/video/memes once; ../ is refused', async () => {
  const dir = addMemes(library(), MEMES);
  const root = mkdtempSync(join(tmpdir(), 'of-u3-project-'));
  made.push(root);
  const first = await placeMeme(root, 'giphy-lol', dir);
  assert.equal(first, 'assets/video/memes/giphy-lol.mp4');
  assert.equal(readFileSync(join(root, first), 'utf8'), 'lol-bytes');
  assert.equal(await placeMeme(root, 'giphy-lol', dir), first);
  await assert.rejects(placeMeme(root, '../x', dir), (e) => e.status === 400);
});

/* ── the routes, on a server of their own ── */
let server;
let base = '';
let lib = '';
let root = '';
before(async () => {
  lib = addMemes(library(), MEMES);
  root = mkdtempSync(join(tmpdir(), 'of-u3-routes-'));
  made.push(root);
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.slice('/api/'.length).split('/').map(decodeURIComponent);
    try {
      if (parts[0] === 'u3') return await u3Route(req, res, parts.slice(1), url.searchParams);
      if (parts[0] === 'projects' && await u3ProjectRoute(req, res, root, parts.slice(2).join('/'))) return undefined;
      res.writeHead(404).end();
    } catch (e) {
      res.writeHead(e.status ?? 500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message }));
    }
    return undefined;
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server?.close());

const withLibrary = async (dir, run) => {
  const was = process.env.OPENFILM_U3_LIBRARY;
  process.env.OPENFILM_U3_LIBRARY = dir;
  try { return await run(); } finally { if (was === undefined) delete process.env.OPENFILM_U3_LIBRARY; else process.env.OPENFILM_U3_LIBRARY = was; }
};

test('GET u3/library/sfx lists the sounds, by category and by what they are for', () => withLibrary(lib, async () => {
  const all = await (await fetch(`${base}/u3/library/sfx`)).json();
  assert.equal(all.dir, lib);
  assert.deepEqual(all.items[0], { id: 'sfx-a-reveal', category: 'reveal', title: 'Ta-da', durationSec: 0.5 });
  assert.equal(all.items.length, 4);
  const pops = await (await fetch(`${base}/u3/library/sfx?category=pop`)).json();
  assert.deepEqual(pops.items.map((i) => i.id), ['sfx-c-pop', 'sfx-d-pop']);
  const shocked = await (await fetch(`${base}/u3/library/sfx?q=${encodeURIComponent('놀람')}`)).json();
  assert.equal(shocked.items[0].id, 'sfx-b-shock');
  assert.ok(shocked.items.every((i) => i.category === 'shock'), 'what does not fit is left out');
  const none = await withLibrary(join(tmpdir(), 'of-u3-no-such-library'), async () => (await fetch(`${base}/u3/library/sfx`)).json());
  assert.deepEqual(none, { dir: null, items: [] });
}));

test('GET u3/library/file is the sound; ../ is refused', () => withLibrary(lib, async () => {
  const res = await fetch(`${base}/u3/library/file?id=sfx-c-pop`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await res.text(), 'sfx-c-pop');
  assert.equal((await fetch(`${base}/u3/library/file?id=${encodeURIComponent('../x')}`)).status, 400);
  assert.equal((await fetch(`${base}/u3/library/file?id=sfx-nope`)).status, 404);
}));

test('POST projects/:id/u3/library/place: its project path, the same one twice; ../ is refused', () => withLibrary(lib, async () => {
  const place = (id) => fetch(`${base}/projects/p/u3/library/place`, { method: 'POST', body: JSON.stringify({ id }) });
  const one = await (await place('sfx-d-pop')).json();
  assert.deepEqual(one, { path: 'assets/audio/sfx/sfx-d-pop.mp3' });
  assert.deepEqual(await (await place('sfx-d-pop')).json(), one);
  assert.equal(readFileSync(join(root, one.path), 'utf8'), 'sfx-d-pop');
  assert.equal((await place('../x')).status, 400);
}));

test('GET u3/library/memes lists the memes, by emotion and by the scene', () => withLibrary(lib, async () => {
  const all = await (await fetch(`${base}/u3/library/memes`)).json();
  assert.equal(all.dir, lib);
  assert.deepEqual(all.items.map((i) => i.id), ['giphy-lol', 'giphy-old', 'tenor-new', 'tenor-wow']);
  assert.deepEqual(all.items[0], { id: 'giphy-lol', emotion: '웃음', situations: [], description: '', durationSec: 2, width: 400, height: 200 });
  const confused = await (await fetch(`${base}/u3/library/memes?emotion=${encodeURIComponent('당황')}`)).json();
  assert.deepEqual(confused.items.map((i) => i.id), ['giphy-old', 'tenor-new']);
  const found = await (await fetch(`${base}/u3/library/memes?q=${encodeURIComponent('깜짝 놀라는 장면')}`)).json();
  assert.deepEqual(found.items.map((i) => i.id), ['tenor-wow'], 'what does not fit is left out');
  const none = await withLibrary(join(tmpdir(), 'of-u3-no-such-library'), async () => (await fetch(`${base}/u3/library/memes`)).json());
  assert.deepEqual(none, { dir: null, items: [] });
}));

test('GET u3/library/file?kind=meme is the meme; another kind and ../ are refused', () => withLibrary(lib, async () => {
  const res = await fetch(`${base}/u3/library/file?kind=meme&id=tenor-wow`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.equal(await res.text(), 'wow-bytes!');
  assert.equal((await fetch(`${base}/u3/library/file?kind=meme&id=${encodeURIComponent('../x')}`)).status, 400);
  assert.equal((await fetch(`${base}/u3/library/file?kind=meme&id=sfx-c-pop`)).status, 404, 'a sound is no meme');
  assert.equal((await fetch(`${base}/u3/library/file?kind=font&id=sfx-c-pop`)).status, 400);
  assert.equal((await fetch(`${base}/u3/library/file?kind=sfx&id=sfx-c-pop`)).status, 200);
}));

test('POST projects/:id/u3/library/place { kind: meme }: into assets/video/memes', () => withLibrary(lib, async () => {
  const place = (body) => fetch(`${base}/projects/p/u3/library/place`, { method: 'POST', body: JSON.stringify(body) });
  const one = await (await place({ id: 'tenor-new', kind: 'meme' })).json();
  assert.deepEqual(one, { path: 'assets/video/memes/tenor-new.mp4' });
  assert.equal(readFileSync(join(root, one.path), 'utf8'), 'new-bytes');
  assert.equal((await place({ id: '../x', kind: 'meme' })).status, 400);
  assert.equal((await place({ id: 'tenor-new', kind: 'other' })).status, 400);
}));

test('Studio answers the routes: the list, a sound, and one placed in a project', () => withLibrary(lib, async () => {
  const { startStudio } = await import('./server.mjs');
  const scratch = mkdtempSync(join(tmpdir(), 'of-u3-studio-'));
  made.push(scratch);
  const home = process.env.OPENFILM_HOME;
  process.env.OPENFILM_HOME = join(scratch, 'home');
  const studio = await startStudio({ port: 0, openBrowser: () => {}, quietMs: 150 });
  try {
    const api = (path, body) => fetch(`${studio.origin}${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'x-studio-key': studio.key, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal((await (await api('/api/u3/library/sfx')).json()).items.length, 4);
    assert.equal(await (await api('/api/u3/library/file?id=sfx-a-reveal')).text(), 'sfx-a-reveal');
    const { project } = await (await api('/api/projects', { path: join(scratch, 'Film') })).json();
    const placed = await (await api(`/api/projects/${project.id}/u3/library/place`, { id: 'sfx-a-reveal' })).json();
    assert.deepEqual(placed, { path: 'assets/audio/sfx/sfx-a-reveal.mp3' });
    assert.equal(readFileSync(join(scratch, 'Film', placed.path), 'utf8'), 'sfx-a-reveal');
    assert.equal((await api(`/api/projects/${project.id}/u3/library/place`, { id: '../x' })).status, 400);
  } finally {
    await studio.close();
    if (home === undefined) delete process.env.OPENFILM_HOME; else process.env.OPENFILM_HOME = home;
  }
}));
