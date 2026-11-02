// @ts-check
/** Deterministic u3 scene-table compilation. Selection and layout are pure; only applyMake writes the film. */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { clipKind, filmHtml, readFilm } from '../../src/film-doc.mjs';
import { probe } from './derived.mjs';
import { inside } from './files.mjs';
import { changeProjectFilm, readProjectFilm } from './film.mjs';
import { HttpError } from './http.mjs';
import { applyOps, EditError } from './ops.mjs';
import { libraryDir, listMemes, listSfx, MEME_EMOTIONS, MEME_EMOTION_SFX, memesInFilm, noMemes, placeMeme, placeSfx, rankMemes, SCENE_SFX } from './u3-library.mjs';
import { memeDoc, memeDocHash, memeSearchService, readMemeIndex } from './u3-meme-embed.mjs';
import { prepareSubtitlePage, subtitleClips } from './u3-subtitles.mjs';

/** @typedef {import('./u3-library.mjs').MemeItem} Meme */
/** @typedef {import('./u3-library.mjs').SfxItem} Sound */
/** @typedef {import('./ops.mjs').Clip} Clip */
/** @typedef {import('./ops.mjs').FilmValue} FilmValue */
/** @typedef {{ inputIndex: number, startSec: number, endSec: number, caption: string, subCaption?: string, reaction: string | null, memeBefore: boolean, memeAfter: boolean, sfxCategory: string | null }} Scene */
/** @typedef {{ src: string, duration: number, width: number, height: number }} Input */
/** @typedef {{ title?: string, scenes: Scene[], inputs: Input[], hash: string }} SceneTable */
/** @typedef {{ w: number, h: number }} Stage */
/** @typedef {{ query: string, reaction?: string }} Visual */
/** @typedef {'subtitle' | 'meme' | 'source' | 'sfx'} Role */
/** @typedef {{ role: Role, clips: Clip[] }} PlannedTrack */

const round = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
/** Media ends are rounded down: film.html serializes only milliseconds. */
const mediaEnd = (/** @type {number} */ n) => Math.floor(n * 1000 + 1e-9) / 1000;
const positive = (/** @type {unknown} */ n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const owned = (/** @type {Clip} */ c) => Object.hasOwn(/** @type {Record<string, string>} */ (c.attrs ?? {}), 'data-u3-make');
const marker = (/** @type {Role} */ role) => ({ 'data-u3-make': role });

/** Validate the entire table before touching film.html. Probe is injectable for fixture media.
 * @param {string} root @param {string} path @param {{ probe?: typeof probe }} [options] @returns {Promise<SceneTable>} */
export async function readScenes(root, path, { probe: measure = probe } = {}) {
  /** @type {any} */
  let value;
  let raw;
  try { raw = await readFile(inside(root, path, { read: true }), 'utf8'); }
  catch (e) { throw new HttpError(400, `장면표: ${/** @type {Error} */ (e).message}`); }
  try { value = JSON.parse(raw); } catch { throw new HttpError(400, '장면표: JSON 형식이 아닙니다'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, '장면표: JSON object가 필요합니다');
  const errors = [];
  if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 30)) errors.push('title: 30자 이내 문자열이 필요합니다');
  const sources = Array.isArray(value.inputs) ? value.inputs : [];
  if (!sources.length || sources.length > 20) errors.push('inputs: 프로젝트 안 영상 경로 1–20개가 필요합니다');
  /** @type {(Input | undefined)[]} */
  const inputs = [];
  for (const [i, src] of sources.entries()) {
    try {
      if (typeof src !== 'string' || clipKind(src) !== 'video' || /[?#]|^[a-z][a-z0-9+.-]*:/i.test(src)) throw new Error('프로젝트 안 영상 파일 경로가 필요합니다');
      const file = inside(root, src, { read: true });
      if (!(await stat(file)).isFile()) throw new Error('영상 파일이 없습니다');
      const info = await measure(root, src);
      if (![info.duration, info.width, info.height].every(positive)) throw new Error('영상 길이와 크기를 확인할 수 없습니다');
      inputs[i] = { src, duration: info.duration, width: info.width, height: info.height };
    } catch (e) { errors.push(`입력 ${i + 1}: ${/** @type {Error} */ (e).message}`); }
  }
  const scenes = Array.isArray(value.scenes) ? value.scenes : [];
  if (!scenes.length) errors.push('scenes: 장면이 하나 이상 필요합니다');
  for (const [i, scene] of scenes.entries()) {
    const fail = (/** @type {string} */ why) => errors.push(`장면 ${i + 1}: ${why}`);
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) { fail('장면 object가 필요합니다'); continue; }
    if (!Number.isInteger(scene.inputIndex) || scene.inputIndex < 1 || scene.inputIndex > sources.length || scene.inputIndex > 20) fail('inputIndex는 1부터 센 입력 번호여야 합니다');
    const input = inputs[scene.inputIndex - 1];
    if (sources[scene.inputIndex - 1] !== undefined && !input) fail('원본 영상 파일·길이·크기를 확인할 수 없습니다');
    if (typeof scene.startSec !== 'number' || typeof scene.endSec !== 'number' || !Number.isFinite(scene.startSec) || !Number.isFinite(scene.endSec)
      || scene.startSec < 0 || scene.endSec <= scene.startSec) fail('0 ≤ startSec < endSec인 영상 구간이 필요합니다');
    if (input && typeof scene.endSec === 'number' && scene.endSec > input.duration) fail('endSec가 원본 길이를 넘습니다');
    if (typeof scene.caption !== 'string' || !scene.caption.trim()) fail('caption은 비어 있지 않은 문자열이어야 합니다');
    if (scene.subCaption !== undefined && typeof scene.subCaption !== 'string') fail('subCaption은 문자열이어야 합니다');
    if (scene.reaction !== null && !Object.values(MEME_EMOTIONS).includes(scene.reaction)) fail('reaction은 14감정 또는 null이어야 합니다');
    if (scene.sfxCategory !== null && !SCENE_SFX.includes(scene.sfxCategory)) fail('sfxCategory는 10분류 또는 null이어야 합니다');
    for (const field of ['memeBefore', 'memeAfter']) if (scene[field] !== undefined && typeof scene[field] !== 'boolean') fail(`${field}는 boolean이어야 합니다`);
    if (scene.reaction === null && (scene.memeBefore === true || scene.memeAfter === true)) fail('reaction이 null이면 memeBefore와 memeAfter는 false여야 합니다');
  }
  if (errors.length) throw new HttpError(400, errors.join('\n'));
  return { title: value.title, inputs: /** @type {Input[]} */ (inputs), scenes: scenes.map((/** @type {Scene} */ s) => ({ ...s, memeBefore: s.memeBefore ?? false, memeAfter: s.memeAfter ?? false })), hash: createHash('sha256').update(raw).digest('hex') };
}

/** u3 core/sfx.ts: explicit category, selected meme emotion, then scene reaction.
 * @param {{ sfxCategory?: string | null, reaction?: string | null }} scene @param {string | null} [emotion] */
export function resolveSceneSfx(scene, emotion) {
  if (scene.sfxCategory) return scene.sfxCategory;
  return MEME_EMOTION_SFX[emotion ?? scene.reaction ?? ''] ?? null;
}
/** @param {string} value */
export function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) { hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
}
/** @template T @param {readonly T[]} list @param {string} seed @param {number} index */
export function pickSfxFile(list, seed, index) { return list.length ? list[fnv1a(`${seed}#${index}`) % list.length] : null; }

/** u3 resolveScriptMemes, with the surviving film's ids excluded before the first assignment.
 * @param {Scene[]} scenes @param {readonly Meme[][]} rankings @param {Iterable<string>} [exclude] */
export function resolveScriptMemes(scenes, rankings, exclude = []) {
  /** @type {Record<number, Meme>} */
  const memes = {};
  /** @type {Record<number, Meme>} */
  const alternates = {};
  const used = new Set(exclude);
  const missing = new Set();
  const resolved = scenes.map((scene, index) => {
    if (scene.reaction === null) return { ...scene, memeBefore: false, memeAfter: false };
    const candidates = rankings[index] ?? [];
    const meme = candidates.find(m => !used.has(m.id));
    if (!meme) { missing.add(index); return { ...scene, memeBefore: false, memeAfter: false }; }
    used.add(meme.id);
    let { memeBefore, memeAfter } = scene;
    if (!memeBefore && !memeAfter) memeAfter = true;
    if (memeBefore && memeAfter) {
      const alternate = candidates.find(m => !used.has(m.id));
      if (alternate) { alternates[index] = alternate; used.add(alternate.id); }
      else { memeBefore = false; memeAfter = true; }
    }
    memes[index] = meme;
    return { ...scene, memeBefore, memeAfter };
  });
  return { scenes: resolved, memes, alternates, missing };
}

/** u3 chooseMissingInputMemes's no-Jev path: last scene with a free candidate, its top candidate.
 * @param {ReturnType<typeof resolveScriptMemes>} resolved @param {readonly Meme[][]} rankings @param {Iterable<string>} [exclude] */
export function chooseMissingInputMemes(resolved, rankings, exclude = []) {
  const scenes = resolved.scenes.map(s => ({ ...s }));
  const memes = { ...resolved.memes };
  const used = new Set([...exclude, ...Object.values(memes).map(m => m.id), ...Object.values(resolved.alternates).map(m => m.id)]);
  const missing = new Set(resolved.missing);
  const assigned = new Set(Object.keys(memes).map(i => scenes[Number(i)].inputIndex));
  for (const input of new Set(scenes.map(s => s.inputIndex))) {
    if (assigned.has(input)) continue;
    const ranked = scenes.flatMap((s, index) => s.inputIndex === input ? [{ index, candidates: (rankings[index] ?? []).filter(m => !used.has(m.id)) }] : []).filter(r => r.candidates.length);
    const selected = ranked.at(-1);
    if (!selected) { scenes.forEach((s, i) => { if (s.inputIndex === input) missing.add(i); }); continue; }
    memes[selected.index] = selected.candidates[0];
    used.add(selected.candidates[0].id);
    scenes[selected.index] = { ...scenes[selected.index], memeBefore: false, memeAfter: true };
  }
  return { scenes, memes, alternates: resolved.alternates, missing };
}

/** Same formula as studio/ui/src/lib/u3-library.ts u3MemeBox.
 * @param {Meme} meme @param {Stage} stage */
export function memeBox(meme, stage) {
  let w = Math.round(stage.w * 0.6);
  let h = Math.round(w * /** @type {number} */ (meme.height) / /** @type {number} */ (meme.width));
  if (h > stage.h) { h = stage.h; w = Math.round(h * /** @type {number} */ (meme.width) / /** @type {number} */ (meme.height)); }
  return { x: Math.round((stage.w - w) / 2), y: Math.round((stage.h - h) / 2), w, h };
}
/** @param {Input} input @param {Stage} stage */
function coverBox(input, stage) {
  const scale = Math.max(stage.w / input.width, stage.h / input.height);
  const w = input.width * scale, h = input.height * scale;
  return { x: round((stage.w - w) / 2), y: round((stage.h - h) / 2), w: round(w), h: round(h) };
}
/** @param {Clip} c */
const duration = c => Number(/** @type {number[]} */ (c.time)[1]) - Number(/** @type {number[]} */ (c.time)[0]);
/** @param {Clip} a @param {Clip} b */
const overlaps = (a, b) => round(Number(a.at ?? 0)) < round(Number(b.at ?? 0) + duration(b)) && round(Number(a.at ?? 0) + duration(a)) > round(Number(b.at ?? 0));
/** u3 placeOverlayInLowestLayer; lane zero is at the bottom in the film.
 * @param {Clip[][]} lanes @param {Clip} clip */
function placeLowest(lanes, clip) {
  const lane = lanes.find(layer => layer.every(c => !overlaps(c, clip)));
  if (lane) lane.push(clip); else lanes.push([clip]);
}

/** Pure layout: no disk, model, clock or mutation of inputs.
 * @param {SceneTable} table @param {{ memes: Meme[], sfx: Sound[] }} library @param {(visual: Visual, index: number) => Meme[]} rank
 * @param {{ stage: Stage, exclude?: string[] }} options */
export function planFilm(table, library, rank, { stage, exclude = [] }) {
  const candidates = new Set(library.memes.filter(m => [m.durationSec, m.width, m.height].every(positive)).map(m => m.id));
  const rankings = table.scenes.map((s, i) => rank({ query: s.caption, ...(s.reaction ? { reaction: s.reaction } : {}) }, i).filter(m => candidates.has(m.id) && !exclude.includes(m.id)));
  const selected = chooseMissingInputMemes(resolveScriptMemes(table.scenes, rankings, exclude), rankings, exclude);
  /** @type {Clip[]} */
  const video = [];
  /** @type {Clip[][]} */
  const memes = [];
  /** @type {Clip[][]} */
  const sounds = [];
  /** @type {import('./u3-subtitles.mjs').SubtitleCue[]} */
  const cues = [];
  /** @type {{ scene: number, id: string, position: 'before' | 'after', at: number, dur: number }[]} */
  const chosenMemes = [];
  /** @type {{ scene: number, id: string, category: string | null, at: number, dur: number }[]} */
  const chosenSfx = [];
  let cursor = 0;
  selected.scenes.forEach((scene, i) => {
    const input = table.inputs[scene.inputIndex - 1];
    const start = round(scene.startSec), end = mediaEnd(scene.endSec);
    const length = round(end - start);
    if (length <= 0) throw new HttpError(400, `장면 ${i + 1}: film.html의 밀리초 정밀도로 표현할 수 없는 영상 구간입니다`);
    const previous = video.at(-1);
    if (previous && previous.src === input.src && Math.abs(/** @type {number[]} */ (previous.time)[1] - start) <= 0.05 + 1e-9) {
      const time = /** @type {number[]} */ (previous.time);
      time[1] = round(time[1] + length);
      if (time[1] > input.duration + 1e-9) throw new HttpError(400, `장면 ${i + 1}: 합친 영상 구간이 원본 길이를 넘습니다`);
    } else video.push({ id: `make-source-${i + 1}`, src: input.src, at: cursor, time: [start, end], box: coverBox(input, stage), attrs: marker('source') });
    let firstMemeAt;
    for (const position of /** @type {const} */ (['before', 'after'])) {
      if (!(position === 'before' ? scene.memeBefore : scene.memeAfter)) continue;
      const meme = position === 'after' && scene.memeBefore && scene.memeAfter ? selected.alternates[i] : selected.memes[i];
      const dur = mediaEnd(Math.min(/** @type {number} */ (meme.durationSec), 2, length));
      const at = position === 'before' ? cursor : round(cursor + length - dur);
      firstMemeAt ??= at;
      const clip = { id: `make-meme-${i + 1}-${position}`, src: `assets/video/memes/${meme.id}.mp4`, at, time: [0, dur], box: memeBox(meme, stage), volume: 0, attrs: marker('meme') };
      placeLowest(memes, clip);
      chosenMemes.push({ scene: i + 1, id: meme.id, position, at, dur });
    }
    cues.push({ startMs: round(cursor * 1000), endMs: round((cursor + length) * 1000), main: scene.caption, sub: scene.subCaption ?? '' });
    const category = resolveSceneSfx(scene, selected.memes[i]?.emotion);
    const list = library.sfx.filter(s => s.category === category && positive(s.durationSec)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const sound = pickSfxFile(list, table.hash.slice(0, 16), i);
    if (sound) {
      const at = firstMemeAt ?? cursor;
      const dur = mediaEnd(Math.min(1.5, /** @type {number} */ (sound.durationSec)));
      placeLowest(sounds, { id: `make-sfx-${i + 1}`, src: `assets/audio/sfx/${sound.path.split(/[\\/]/).at(-1)}`, at, time: [0, dur], attrs: marker('sfx') });
      chosenSfx.push({ scene: i + 1, id: sound.id, category, at, dur });
    }
    cursor = round(cursor + length);
  });
  /** @type {PlannedTrack[]} */
  const tracks = [
    { role: 'subtitle', clips: subtitleClips(cues, { layer: 'make', escape: false, attrs: marker('subtitle') }) },
    ...memes.toReversed().map(clips => ({ role: /** @type {const} */ ('meme'), clips })),
    { role: 'source', clips: video },
    ...sounds.toReversed().map(clips => ({ role: /** @type {const} */ ('sfx'), clips })),
  ];
  return { stage, tracks, receipt: { scenes: table.scenes.length, duration: cursor, memes: chosenMemes, sfx: chosenSfx, missingMemes: selected.missing.size, missingSceneIndexes: [...selected.missing].sort((a, b) => a - b), warning: '다시 실행하면 data-u3-make 클립의 손 편집을 교체합니다. 보존할 클립에서는 data-u3-make 속성을 지우세요.' } };
}

/** @param {FilmValue} value */
function assertUnlocked(value) {
  if (value.tracks.some(t => t.locked && t.clips.some(owned))) throw new HttpError(409, 'make 클립이 locked 트랙에 있습니다. 트랙 잠금을 먼저 해제하세요.');
}
/** @param {Clip} clip @returns {Role} */
function roleOf(clip) {
  const role = /** @type {Record<string, string>} */ (clip.attrs ?? {})['data-u3-make'];
  if (['subtitle', 'meme', 'source', 'sfx'].includes(role)) return /** @type {Role} */ (role);
  return clip.id.startsWith('u3sub-') ? 'subtitle' : clipKind(clip.src) === 'sound' ? 'sfx' : clip.volume === 0 ? 'meme' : 'source';
}

/** One atomic film transaction. Reuse owned tracks and their flags; never remove a human clip by its id.
 * @param {string} root @param {ReturnType<typeof planFilm>} plan @param {{ expected?: string }} [options] */
export async function applyMake(root, plan, { expected } = {}) {
  return changeProjectFilm(root, (value, current) => {
    if (!current.value) throw new EditError(current.problems.join('\n'), 'invalid');
    assertUnlocked(value);
    if (expected !== undefined && current.text !== expected) throw new EditError('film.html changed during make; run get make again', 'conflict');
    const originals = [...value.tracks];
    const old = originals.filter(t => t.clips.some(owned));
    const start = old.length ? originals.indexOf(old[0]) : 0;
    const removed = originals.flatMap(t => t.clips.filter(owned).map(c => ({ op: /** @type {const} */ ('remove'), clip: c.id })));
    const taken = new Set(originals.flatMap(t => t.clips.filter(c => !owned(c)).map(c => c.id)));
    const reused = new Set();
    const slots = plan.tracks.map(({ role, clips }) => {
      const track = old.find(t => !reused.has(t) && t.clips.some(c => owned(c) && roleOf(c) === role)
        && t.clips.filter(c => !owned(c)).every(c => Array.isArray(c.time) && clips.every(next => !overlaps(c, next))));
      const target = track ?? { clips: [] };
      reused.add(target);
      return { target, clips: clips.map(c => {
        let id = c.id;
        while (taken.has(id)) id += '-b';
        taken.add(id);
        return { ...c, id };
      }) };
    });
    const remaining = originals.filter(t => !reused.has(t));
    const anchor = originals.slice(0, start).filter(t => !reused.has(t)).length;
    remaining.splice(anchor, 0, ...slots.map(s => s.target));
    value.tracks = remaining;
    const insert = slots.flatMap(s => s.clips.map(clip => ({ op: /** @type {const} */ ('insert'), clip, track: value.tracks.indexOf(s.target) })));
    applyOps(value, [...removed, ...insert]);
    const checked = readFilm(value);
    if (!checked.doc) throw new EditError(checked.problems.join('\n'), 'invalid');
    return { value };
  });
}

/** Freeze the ranking mode before any query; every index document must still match the library.
 * @param {Meme[]} memes @param {string} dir @param {ReturnType<typeof memeSearchService>} [search] */
export async function rankMode(memes, dir, search = memeSearchService()) {
  const status = await search.status();
  if (!status.available) return { mode: /** @type {const} */ ('rule'), reason: '임베딩 모듈이 없습니다' };
  if (status.state !== 'ready') return { mode: /** @type {const} */ ('rule'), reason: '검증된 bge-m3 모델이 없습니다' };
  const index = await readMemeIndex(join(dir, 'meme-embed'));
  if (!index) return { mode: /** @type {const} */ ('rule'), reason: '유효한 bge-m3 색인이 없습니다' };
  const hashes = new Map(index.meta.items.map((/** @type {{ id: string, docHash: string }} */ m) => [m.id, m.docHash]));
  if (!memes.every(m => hashes.get(m.id) === memeDocHash(memeDoc(m)))) return { mode: /** @type {const} */ ('rule'), reason: '색인 docHash가 라이브러리와 다릅니다' };
  return { mode: /** @type {const} */ ('embedding'), reason: '임베딩 모듈·검증된 모델·색인·docHash를 확인했습니다' };
}

/** Local get make entry point. A failed embedding query restarts all selection in rule mode.
 * @param {string} root @param {{ scenes: string }} args
 * @param {{ probe?: typeof probe, dir?: string, search?: ReturnType<typeof memeSearchService> }} [options] */
export async function makeFilm(root, { scenes }, { probe: measure = probe, dir = libraryDir(), search = memeSearchService() } = {}) {
  const table = await readScenes(root, scenes, { probe: measure });
  const current = await readProjectFilm(root);
  if (!current.value || !current.doc) throw new EditError(current.problems.join('\n'), 'invalid');
  assertUnlocked(current.value);
  const allMemes = await listMemes(dir);
  if (!allMemes) throw new HttpError(404, noMemes(dir));
  const surviving = structuredClone(current.value);
  surviving.tracks.forEach(t => { t.clips = t.clips.filter(c => !owned(/** @type {Clip} */ (c))); });
  surviving.tracks = surviving.tracks.filter(t => t.clips.length);
  const exclude = await memesInFilm(root, filmHtml(surviving), allMemes);
  const library = { memes: allMemes.filter(m => [m.durationSec, m.width, m.height].every(positive)).map(m => ({ ...m })), sfx: (await listSfx(dir) ?? []).map(s => ({ ...s })) };
  let ranking = await rankMode(allMemes, dir, search);
  /** @param {'rule' | 'embedding'} mode */
  const calculate = async mode => {
    /** @type {Meme[][]} */
    const rankings = [];
    for (const s of table.scenes) rankings.push((await rankMemes({ query: s.caption, ...(s.reaction ? { reaction: s.reaction } : {}) }, library.memes, library.memes.length, { exclude }, dir, search, mode)).map(r => r.meme));
    return rankings;
  };
  let rankings;
  try { rankings = await calculate(ranking.mode); }
  catch (e) {
    if (ranking.mode !== 'embedding') throw e;
    ranking = { mode: 'rule', reason: `임베딩 호출 실패로 실행 전체를 rule로 재계산했습니다: ${/** @type {Error} */ (e).message}` };
    rankings = await calculate('rule');
  }
  const layout = () => planFilm(table, library, (_, i) => rankings[i], { stage: /** @type {Stage} */ (current.doc?.stage), exclude });
  let plan = layout();
  // Sidecars round durations; probe selected files so #t never exceeds the playable media boundary.
  const selected = [
    ...new Set(plan.receipt.memes.map(m => m.id)),
  ].map(id => library.memes.find(m => m.id === id));
  const effects = [...new Set(plan.receipt.sfx.map(s => s.id))].map(id => library.sfx.find(s => s.id === id));
  for (const item of [...selected, ...effects]) {
    if (!item) continue;
    const info = await measure(dir, relative(dir, item.path).split('\\').join('/'));
    if (!positive(info.duration)) throw new HttpError(400, `${item.id}: 미디어 길이를 확인할 수 없습니다`);
    item.durationSec = Math.min(/** @type {number} */ (item.durationSec), info.duration);
  }
  plan = layout();
  // Complete media placement and templates before the synchronous, atomic film edit.
  for (const { id } of plan.receipt.memes) {
    const path = await placeMeme(root, id, dir);
    for (const track of plan.tracks) for (const clip of track.clips) if (clip.src === `assets/video/memes/${id}.mp4`) clip.src = path;
  }
  for (const { id, scene } of plan.receipt.sfx) {
    const path = await placeSfx(root, id, dir);
    for (const track of plan.tracks) for (const clip of track.clips) if (clip.id === `make-sfx-${scene}`) clip.src = path;
  }
  await prepareSubtitlePage(root, 'make', plan.stage);
  await applyMake(root, plan, { expected: current.text });
  return { ...plan.receipt, rankMode: ranking.mode, rankReason: ranking.reason };
}
