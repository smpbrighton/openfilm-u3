// @ts-check
/**
 * u3's bundled library: sound effects and reaction memes found by what a moment is about, not made. The library is
 * u3's as it is: `sfx/<category>/sfx-<id>.mp3`, each with a `.json` beside it of the same name ({ id, category, file,
 * title, source, license, durationSec }), and `memes/<emotion>/<id>.mp4` with `<id>.json` ({ id, emotion, situations,
 * description, durationSec, width, height, importedAt, tagsConfirmed, sourceUrl }; fetched, not in git:
 * u3/scripts/fetch-library.mjs). Where it is: `OPENFILM_U3_LIBRARY`, else `<repo>/u3/library` of a source checkout
 * (the desktop app passes its `resources/u3-library`). The scores are u3's own (u3 `src/core/sfx.ts`,
 * `src/core/meme-match.ts`); equal scores have one order, so one prompt always picks one file.
 *
 *   GET  u3/library/sfx?q=&category=            → { dir: string | null, items: [{ id, category, title, durationSec }] }
 *   GET  u3/library/memes?q=&emotion=           → { dir: string | null, items: [{ id, emotion, situations, description,
 *                                                   durationSec, width, height }] }
 *   GET  u3/library/file?id=&kind=sfx|meme      → the sound (audio/mpeg) or the meme (video/mp4); sfx without kind
 *   POST projects/:id/u3/library/place { id, kind? } → { path }: copied into assets/audio/sfx/ or assets/video/memes/
 *                                                 (once: the same file there already, of the same size, is that one)
 */
import { createHash } from 'node:crypto';
import { createReadStream, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, json, readJson } from './http.mjs';
import { bringIn, inside } from './files.mjs';
import { kindOf, readFilmFile } from '../../src/film-doc.mjs';

/** @typedef {import('./http.mjs').Req} Req @typedef {import('./http.mjs').Res} Res */

/**
 * One sound effect: `path` is its file on this computer.
 * @typedef {{ id: string, category: string, title: string, durationSec: number | null, source: string, license: string, path: string }} SfxItem
 */

/** Where placed sounds go in a project. */
export const SFX_DIR = 'assets/audio/sfx';
/** Where placed memes go in a project. */
export const MEMES_DIR = 'assets/video/memes';

/**
 * One meme: `path` is its file on this computer, `size` its bytes.
 * @typedef {{ id: string, emotion: string, situations: string[], description: string, durationSec: number | null,
 *   width: number | null, height: number | null, importedAt: string, tagsConfirmed: boolean, sourceUrl: string,
 *   path: string, size: number }} MemeItem
 */

/** u3's meme emotions (src/core/schema.ts), by the library's folder for each. */
export const MEME_EMOTIONS = /** @type {const} */ ({
  agree: '인정', anger: '분노', annoyed: '귀찮음', anticipation: '기대', chills: '소름', confused: '당황', doubt: '의심',
  embarrassed: '부끄러움', injustice: '억울', laugh: '웃음', proud: '뿌듯함', resignation: '체념', surprised: '놀람', touched: '감동',
});

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

/* ── u3's meme scores (src/core/meme-match.ts), as they are there ── */
export const DESCRIPTION_SCORE_MAX = 6;
const norm = (/** @type {string} */ value) => value.normalize('NFC').toLowerCase().trim();
/** @param {string} text */
function tokens(text) { return norm(text).split(/[\s,./·|!?~()[\]"'“”‘’]+/).map((item) => item.trim()).filter((item) => [...item].length >= 2); }
/** @param {string} text */
function bigrams(text) {
  const out = new Set();
  for (const word of norm(text).split(/[\s,./·|!?~()[\]"'“”‘’…:;]+/)) {
    const chars = [...word];
    if (chars.length === 1) out.add(chars[0]);
    for (let i = 0; i + 1 < chars.length; i++) out.add(chars[i] + chars[i + 1]);
  }
  out.delete('');
  return out;
}
/** How much of `text` the description says, in two-letter pieces (0 to DESCRIPTION_SCORE_MAX). @param {string} text @param {string} description */
export function descriptionScore(text, description) {
  const source = bigrams(text);
  if (!source.size) return 0;
  const target = bigrams(description);
  let hit = 0;
  for (const gram of source) if (target.has(gram)) hit++;
  return Math.round((DESCRIPTION_SCORE_MAX * hit * 10) / source.size) / 10;
}
/**
 * How well a meme fits a scene (`query`) and the feeling it reacts with (`reaction`), u3's `scoreMeme`.
 * @param {{ query: string, reaction?: string }} visual
 * @param {{ emotion: string, situations: readonly string[], tagsConfirmed?: boolean, description?: string }} meme
 */
export function scoreMeme(visual, meme) {
  const reaction = visual.reaction ? norm(visual.reaction) : '';
  const text = norm(`${visual.reaction ?? ''} ${visual.query}`);
  const words = tokens(text);
  const emotion = norm(meme.emotion);
  let score = 0;
  if (reaction && reaction === emotion) score += 10;
  else if (emotion && text.includes(emotion)) score += 5;
  for (const tag of meme.situations.map(norm).filter(Boolean)) {
    if (reaction && reaction === tag) score += 8;
    else if (text.includes(tag)) score += 4;
    else if (words.some((word) => tag.includes(word))) score += 2;
  }
  if (score > 0 && meme.tagsConfirmed) score += 0.5;
  if (meme.description) score += descriptionScore(text, meme.description);
  return score;
}
/**
 * The best `limit` memes for a scene, u3's `matchMemes`: `exclude` left out, `recent` 6 down; equal scores the newest
 * first (importedAt), then by id.
 * @template {{ id: string, emotion: string, situations: readonly string[], tagsConfirmed?: boolean, description?: string, importedAt: string }} T
 * @param {{ query: string, reaction?: string }} visual @param {readonly T[]} memes @param {number} [limit]
 * @param {{ exclude?: Iterable<string>, recent?: Iterable<string> }} [opts] @returns {{ meme: T, score: number }[]}
 */
export function matchMemes(visual, memes, limit = 3, opts = {}) {
  const exclude = new Set(opts.exclude ?? []);
  const recent = new Set(opts.recent ?? []);
  return memes.filter((item) => !exclude.has(item.id)).map((meme) => ({ meme, score: scoreMeme(visual, meme) - (recent.has(meme.id) ? 6 : 0) }))
    .sort((a, b) => b.score - a.score || b.meme.importedAt.localeCompare(a.meme.importedAt) || a.meme.id.localeCompare(b.meme.id)).slice(0, Math.max(0, limit));
}

/* ── where the library is, and what is in it ── */

/** The library's folder (it may not be there). */
export function libraryDir(env = process.env) {
  const set = env.OPENFILM_U3_LIBRARY?.trim();
  return set ? resolve(set) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../u3/library');
}

/** The sentence for a library that is not there. @param {string} dir */
export const noLibrary = (dir) => `The u3 library is not at ${dir}: set OPENFILM_U3_LIBRARY to the folder that has sfx/ in it.`;
/** The sentence for a library without its memes. @param {string} dir */
export const noMemes = (dir) => `The u3 library at ${dir} has no memes/: fetch them with \`node u3/scripts/fetch-library.mjs\` (needs \`gh auth login\`), or set OPENFILM_U3_LIBRARY to the folder that has memes/ in it.`;

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

/** @type {Map<string, { sig: string, items: MemeItem[] }>} */
const keptMemes = new Map();
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const size = (/** @type {unknown} */ v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

/**
 * The memes of the library at `dir`, in id order, or null when it has none there. A sidecar that does not read, or
 * without its `<id>.mp4` beside it, is left out. Read again when a folder of it changed (its time), else as read last.
 * @param {string} [dir] @returns {Promise<MemeItem[] | null>}
 */
export async function listMemes(dir = libraryDir()) {
  const memes = join(dir, 'memes');
  if (!isDir(memes)) return null;
  const folders = readdirSync(memes).filter((name) => !name.startsWith('.') && isDir(join(memes, name))).sort();
  const sig = [memes, ...folders.map((f) => join(memes, f))].map((p) => `${p}:${statSync(p).mtimeMs}`).join('|');
  const was = keptMemes.get(memes);
  if (was && was.sig === sig) return was.items;
  /** @type {MemeItem[]} */
  const items = [];
  const ids = new Set();
  for (const folder of folders) {
    const at = join(memes, folder);
    for (const name of readdirSync(at).filter((n) => n.endsWith('.json')).sort()) {
      /** @type {any} */
      let meta;
      try { meta = JSON.parse(await readFile(join(at, name), 'utf8')); } catch { continue; }
      const id = text(meta?.id);
      if (!ID.test(id) || ids.has(id)) continue;
      const path = join(at, `${id}.mp4`);
      const file = lstatSync(path, { throwIfNoEntry: false });
      if (!file?.isFile()) continue;
      ids.add(id);
      items.push({
        id, emotion: text(meta.emotion) || (/** @type {Record<string, string>} */ (MEME_EMOTIONS))[folder] || folder,
        situations: Array.isArray(meta.situations) ? meta.situations.map(text).filter(Boolean) : [],
        description: text(meta.description), durationSec: size(meta.durationSec), width: size(meta.width), height: size(meta.height),
        importedAt: text(meta.importedAt), tagsConfirmed: meta.tagsConfirmed === true, sourceUrl: text(meta.sourceUrl), path, size: file.size,
      });
    }
  }
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  keptMemes.set(memes, { sig, items });
  return items;
}

/** What the panel lists of a meme. @param {MemeItem} item */
export const shownMeme = ({ id, emotion, situations, description, durationSec, width, height }) => ({ id, emotion, situations, description, durationSec, width, height });

/** A library item's file as it is on disk: a link in the library to elsewhere is not followed. @param {string} id @param {string} path @param {string} dir */
function stayIn(id, path, dir) {
  const back = relative(realpathSync.native(dir), realpathSync.native(path));
  if (!back || back.split(sep)[0] === '..') throw new HttpError(400, `${id} is not in the u3 library`);
}

/**
 * The meme `id`: only one of the library's, its file in the library. Throws a 400 for what is not an id, a 404 for
 * one the library does not have.
 * @param {unknown} id @param {string} [dir] @returns {Promise<MemeItem>}
 */
export async function memeById(id, dir = libraryDir()) {
  if (typeof id !== 'string' || !ID.test(id)) throw new HttpError(400, 'which meme? an id of the u3 library');
  const items = await listMemes(dir);
  if (!items) throw new HttpError(404, noMemes(dir));
  const item = items.find((i) => i.id === id);
  if (!item) throw new HttpError(404, `the u3 library has no meme ${id}`);
  stayIn(id, item.path, dir);
  return item;
}

/** @type {Map<string, string>} a file's sha256, by its path, size and time */
const hashes = new Map();
/** @param {string} path @returns {Promise<string>} */
async function sha256(path) {
  const { size: bytes, mtimeMs } = statSync(path);
  const key = `${path}\0${bytes}\0${mtimeMs}`;
  const was = hashes.get(key);
  if (was) return was;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const digest = hash.digest('hex');
  hashes.set(key, digest);
  return digest;
}

/**
 * The memes of `memes` a film uses already: the files of its video clips (film.html `text`, in the project at `root`)
 * that are one of them, by what is in them (a copy under another name too). Only files of a meme's size are read.
 * In id order; none for a film that does not read.
 * @param {string} root @param {string} text @param {readonly MemeItem[]} memes @returns {Promise<string[]>}
 */
export async function memesInFilm(root, text, memes) {
  /** @type {any} */
  let doc;
  try { doc = readFilmFile(text).doc; } catch { return []; }
  /** @type {Set<string>} */
  const files = new Set();
  for (const track of doc?.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      if (kindOf(clip) !== 'video' || /^[a-z][a-z0-9+.-]*:/i.test(clip.src)) continue;
      try { files.add(inside(root, clip.src, { read: true })); } catch { /* a source out of the folder: no file of this project */ }
    }
  }
  /** @type {Map<number, MemeItem[]>} */
  const bySize = new Map();
  for (const meme of memes) bySize.set(meme.size, [...(bySize.get(meme.size) ?? []), meme]);
  const used = new Set();
  for (const file of files) {
    const there = statSync(file, { throwIfNoEntry: false });
    const same = there?.isFile() ? bySize.get(there.size) : undefined;
    if (!same) continue;
    const digest = await sha256(file);
    for (const meme of same) if (await sha256(meme.path) === digest) used.add(meme.id);
  }
  return [...used].sort();
}

/**
 * The sound effect `id`: only one of the library's, its file in the library. Throws a 400 for what is not an id,
 * a 404 for one the library does not have.
 * @param {unknown} id @param {string} [dir] @returns {Promise<SfxItem>}
 */
export async function sfxById(id, dir = libraryDir()) {
  if (typeof id !== 'string' || !ID.test(id)) throw new HttpError(400, 'which sound? an id of the u3 library');
  const items = await listSfx(dir);
  if (!items) throw new HttpError(404, noLibrary(dir));
  const item = items.find((i) => i.id === id);
  if (!item) throw new HttpError(404, `the u3 library has no ${id}`);
  stayIn(id, item.path, dir);
  return item;
}

/**
 * Put the sound effect `id` in the project at `root`: `assets/audio/sfx/<its file>`, or the file there already when it
 * is the same size. Returns its project path.
 * @param {string} root @param {unknown} id @param {string} [dir]
 */
export async function placeSfx(root, id, dir = libraryDir()) {
  return placeFile(root, SFX_DIR, (await sfxById(id, dir)).path);
}

/**
 * Put the meme `id` in the project at `root`: `assets/video/memes/<id>.mp4`, or the file there already when it is the
 * same size. Returns its project path.
 * @param {string} root @param {unknown} id @param {string} [dir]
 */
export async function placeMeme(root, id, dir = libraryDir()) {
  return placeFile(root, MEMES_DIR, (await memeById(id, dir)).path);
}

/** @param {string} root @param {string} folder @param {string} path */
async function placeFile(root, folder, path) {
  const rel = `${folder}/${basename(path)}`;
  const there = lstatSync(join(root, ...rel.split('/')), { throwIfNoEntry: false });
  if (there?.isFile() && there.size === statSync(path).size) return rel;
  const [landed] = await bringIn(root, folder, [path], 'copy');
  return landed;
}

/** `kind` of a request: a meme, else a sound (what it was before memes). Throws a 400 for another. @param {unknown} kind */
function kindAsked(kind) {
  if (kind === undefined || kind === null || kind === '' || kind === 'sfx') return 'sfx';
  if (kind === 'meme') return 'meme';
  throw new HttpError(400, 'kind: sfx or meme');
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
  if (parts[0] === 'library' && parts[1] === 'memes' && parts.length === 2 && req.method === 'GET') {
    const items = await listMemes(dir);
    if (!items) return json(res, 200, { dir: null, items: [] });
    const emotion = query.get('emotion') ?? '';
    const q = (query.get('q') ?? '').trim();
    const of = emotion ? items.filter((i) => i.emotion === emotion) : items;
    const found = q ? matchMemes({ query: q }, of, of.length).filter((r) => r.score > 0).map((r) => r.meme) : of;
    return json(res, 200, { dir, items: found.map(shownMeme) });
  }
  if (parts[0] === 'library' && parts[1] === 'file' && parts.length === 2 && req.method === 'GET') {
    const meme = kindAsked(query.get('kind')) === 'meme';
    const item = meme ? await memeById(query.get('id'), dir) : await sfxById(query.get('id'), dir);
    const bytes = await readFile(item.path);
    res.writeHead(200, { 'content-type': meme ? 'video/mp4' : 'audio/mpeg', 'content-length': bytes.length, 'cache-control': 'private, max-age=3600' });
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
  const body = /** @type {{ id?: unknown, kind?: unknown }} */ (await readJson(req));
  json(res, 200, { path: kindAsked(body?.kind) === 'meme' ? await placeMeme(root, body?.id) : await placeSfx(root, body?.id) });
  return true;
}
