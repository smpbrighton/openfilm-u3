import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { libraryDir, listSfx, noLibrary, placeSfx, rankSfx, sfxById, sfxSituationScore, u3ProjectRoute, u3Route } from './u3-library.mjs';

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

/* ── the routes, on a server of their own ── */
let server;
let base = '';
let lib = '';
let root = '';
before(async () => {
  lib = library();
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
