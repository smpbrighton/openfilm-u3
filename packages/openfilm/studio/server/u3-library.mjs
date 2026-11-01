// @ts-check
/**
 * u3's bundled library: sound effects found by what a moment is about, not made. The library is u3's as it is:
 * `sfx/<category>/sfx-<id>.mp3`, each with a `.json` beside it of the same name ({ id, category, file, title, source,
 * license, durationSec }). Where it is: `OPENFILM_U3_LIBRARY`, else `<repo>/u3/library` of a source checkout (the
 * desktop app passes its `resources/u3-library`). The scores are u3's own (u3 `src/core/sfx.ts`); equal scores keep
 * id order, so one prompt always picks one file.
 *
 *   GET  u3/library/sfx?q=&category=            → { dir: string | null, items: [{ id, category, title, durationSec }] }
 *   GET  u3/library/file?id=                    → the sound (audio/mpeg)
 *   POST projects/:id/u3/library/place { id }   → { path }: copied into assets/audio/sfx/ (once: the same file there
 *                                                 already, of the same size, is that one)
 */
import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, json, readJson } from './http.mjs';
import { bringIn } from './files.mjs';

/** @typedef {import('./http.mjs').Req} Req @typedef {import('./http.mjs').Res} Res */

/**
 * One sound effect: `path` is its file on this computer.
 * @typedef {{ id: string, category: string, title: string, durationSec: number | null, source: string, license: string, path: string }} SfxItem
 */

/** Where placed sounds go in a project. */
export const SFX_DIR = 'assets/audio/sfx';

/* ── u3's scores (src/core/schema.ts SCENE_SFX, src/core/sfx.ts), as they are there ── */
export const SCENE_SFX = /** @type {const} */ (['shock', 'fail', 'laugh', 'applause', 'alarm', 'impact', 'bruh', 'notify', 'pop', 'reveal']);
/** @type {Record<string, string>} */
export const SCENE_SFX_USES = {
  shock: '깜짝 놀람, 소름 돋는 반전', fail: '실패, 허탈함, 체념', laugh: '웃긴 상황, 어이없는 웃음', applause: '인정, 감탄, 해냈을 때',
  alarm: '경고, 급한 상황, 문제 발생', impact: '쾅 하고 꽂히는 순간, 분노, 당황', bruh: '황당함, 의심, 귀찮음', notify: '알림, 기대, 새 소식',
  pop: '가볍게 톡 튀는 순간, 귀여운 반응', reveal: '짠 하고 보여 주는 순간',
};
/** @type {Readonly<Record<string, string>>} */
export const MEME_EMOTION_SFX = { 놀람: 'shock', 소름: 'shock', 체념: 'fail', 억울: 'fail', 분노: 'impact', 당황: 'impact', 웃음: 'laugh', 의심: 'bruh', 귀찮음: 'bruh', 인정: 'applause', 감동: 'applause', 뿌듯함: 'applause', 기대: 'notify', 부끄러움: 'pop' };

/**
 * How well a sound effect fits a moment described in words (u3 `sfxSituationScore`).
 * @param {string} situation @param {{ id: string, title?: string, category?: string, description?: string }} candidate
 */
export function sfxSituationScore(situation, candidate) {
  const query = situation.toLocaleLowerCase();
  const category = candidate.category ?? '';
  const uses = SCENE_SFX_USES[category] ?? '';
  let score = 0;
  if ([candidate.id, candidate.title, category, candidate.description].some((value) => value?.toLocaleLowerCase().includes(query) || (query.length > 1 && value?.toLocaleLowerCase().includes(query.slice(0, -1))))) score += 100;
  if (uses && [...query.matchAll(/[가-힣]{2,}|[a-z]{2,}/gi)].some(([word]) => uses.toLocaleLowerCase().includes(word.toLocaleLowerCase()))) score += 20;
  if (Object.entries(MEME_EMOTION_SFX).some(([emotion, sfx]) => sfx === category && query.includes(emotion))) score += 10;
  if (category === 'reveal' && /(반전|드러|밝혀|공개)/.test(query)) score += 20;
  if (category === 'shock' && /(반전|놀|깜짝|소름)/.test(query)) score += 20;
  return score;
}

/**
 * The items best first for a moment; equal scores in id order (the items come in id order).
 * @template {{ id: string, title?: string, category?: string }} T
 * @param {string} situation @param {readonly T[]} items @returns {{ item: T, score: number }[]}
 */
export function rankSfx(situation, items) {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((item) => ({ item, score: sfxSituationScore(situation, item) }))
    .sort((a, b) => b.score - a.score);
}

/* ── where the library is, and what is in it ── */

/** The library's folder (it may not be there). */
export function libraryDir(env = process.env) {
  const set = env.OPENFILM_U3_LIBRARY?.trim();
  return set ? resolve(set) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../u3/library');
}

/** The sentence for a library that is not there. @param {string} dir */
export const noLibrary = (dir) => `The u3 library is not at ${dir}: set OPENFILM_U3_LIBRARY to the folder that has sfx/ in it.`;

/** @type {Map<string, { sig: string, items: SfxItem[] }>} */
const kept = new Map();

const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '');
const isDir = (/** @type {string} */ p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/**
 * The sound effects of the library at `dir`, in id order, or null when it has none there. Read again when a folder
 * of it changed (its time), else as read last.
 * @param {string} [dir] @returns {Promise<SfxItem[] | null>}
 */
export async function listSfx(dir = libraryDir()) {
  const sfx = join(dir, 'sfx');
  if (!isDir(sfx)) return null;
  const categories = readdirSync(sfx).filter((name) => !name.startsWith('.') && isDir(join(sfx, name))).sort();
  const sig = [sfx, ...categories.map((c) => join(sfx, c))].map((p) => `${p}:${statSync(p).mtimeMs}`).join('|');
  const was = kept.get(sfx);
  if (was && was.sig === sig) return was.items;
  /** @type {SfxItem[]} */
  const items = [];
  const ids = new Set();
  for (const category of categories) {
    const folder = join(sfx, category);
    for (const name of readdirSync(folder).filter((n) => n.endsWith('.json')).sort()) {
      /** @type {any} */
      let meta;
      try { meta = JSON.parse(await readFile(join(folder, name), 'utf8')); } catch { continue; }
      const id = text(meta?.id);
      const file = text(meta?.file) || `${basename(name, '.json')}.mp3`;
      /* its sound beside it, by a plain name: nothing of the library leads out of it */
      if (!id || ids.has(id) || basename(file) !== file || file.startsWith('.')) continue;
      const path = join(folder, file);
      if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) continue;
      const seconds = Number(meta.durationSec);
      ids.add(id);
      items.push({
        id, category: text(meta.category) || category, title: text(meta.title) || id,
        durationSec: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
        source: text(meta.source), license: text(meta.license), path,
      });
    }
  }
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  kept.set(sfx, { sig, items });
  return items;
}

/** What the panel lists of one. @param {SfxItem} item */
export const shown = ({ id, category, title, durationSec }) => ({ id, category, title, durationSec });

/**
 * The sound effect `id`: only one of the library's, its file in the library. Throws a 400 for what is not an id,
 * a 404 for one the library does not have.
 * @param {unknown} id @param {string} [dir] @returns {Promise<SfxItem>}
 */
export async function sfxById(id, dir = libraryDir()) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) throw new HttpError(400, 'which sound? an id of the u3 library');
  const items = await listSfx(dir);
  if (!items) throw new HttpError(404, noLibrary(dir));
  const item = items.find((i) => i.id === id);
  if (!item) throw new HttpError(404, `the u3 library has no ${id}`);
  /* as it is on disk too: a link in the library to elsewhere is not followed */
  const home = realpathSync.native(dir);
  const back = relative(home, realpathSync.native(item.path));
  if (!back || back.split(sep)[0] === '..') throw new HttpError(400, `${id} is not in the u3 library`);
  return item;
}

/**
 * Put the sound effect `id` in the project at `root`: `assets/audio/sfx/<its file>`, or the file there already when it
 * is the same size. Returns its project path.
 * @param {string} root @param {unknown} id @param {string} [dir]
 */
export async function placeSfx(root, id, dir = libraryDir()) {
  const item = await sfxById(id, dir);
  const rel = `${SFX_DIR}/${basename(item.path)}`;
  const there = lstatSync(join(root, ...rel.split('/')), { throwIfNoEntry: false });
  if (there?.isFile() && there.size === statSync(item.path).size) return rel;
  const [landed] = await bringIn(root, SFX_DIR, [item.path], 'copy');
  return landed;
}

/**
 * `u3/...` (parts after `u3`). Throws a 404 for what is not one.
 * @param {Req} req @param {Res} res @param {string[]} parts @param {URLSearchParams} query
 */
export async function u3Route(req, res, parts, query) {
  const dir = libraryDir();
  if (parts[0] === 'library' && parts[1] === 'sfx' && parts.length === 2 && req.method === 'GET') {
    const items = await listSfx(dir);
    if (!items) return json(res, 200, { dir: null, items: [] });
    const category = query.get('category') ?? '';
    const q = (query.get('q') ?? '').trim();
    const of = category ? items.filter((i) => i.category === category) : items;
    const found = q ? rankSfx(q, of).filter((r) => r.score > 0).map((r) => r.item) : of;
    return json(res, 200, { dir, items: found.map(shown) });
  }
  if (parts[0] === 'library' && parts[1] === 'file' && parts.length === 2 && req.method === 'GET') {
    const item = await sfxById(query.get('id'), dir);
    const bytes = await readFile(item.path);
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': bytes.length, 'cache-control': 'private, max-age=3600' });
    res.end(bytes);
    return undefined;
  }
  throw new HttpError(404, 'no such API');
}

/**
 * `u3/library/place` of a project. True when it was this route.
 * @param {Req} req @param {Res} res @param {string} root @param {string} rest
 */
export async function u3ProjectRoute(req, res, root, rest) {
  if (rest !== 'u3/library/place' || req.method !== 'POST') return false;
  const body = /** @type {{ id?: unknown }} */ (await readJson(req));
  json(res, 200, { path: await placeSfx(root, body?.id) });
  return true;
}
