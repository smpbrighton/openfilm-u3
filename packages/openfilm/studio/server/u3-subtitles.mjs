// @ts-check
/** Local WebVTT import: one cue per page clip, one page and track per layer. */
import { constants } from 'node:fs';
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { readFilm } from '../../src/film-doc.mjs';
import { changeProjectFilm } from './film.mjs';
import { inside } from './files.mjs';
import { HttpError } from './http.mjs';
import { applyOps, EditError } from './ops.mjs';
import { parseVtt } from './transcripts.mjs';
import { pagesDir } from './u3-library.mjs';

const PROPS = [
  { name: '메인', type: 'text', at: '#main-src' },
  { name: '서브', type: 'text', at: '#sub-src' },
  { name: '튀어나옴', type: 'var', var: '--u3-pop' },
  { name: '떠오름', type: 'var', var: '--u3-rise' },
  { name: '흔들림', type: 'var', var: '--u3-shake' },
  { name: '색', type: 'var', var: '--u3-color' },
  { name: '크기', type: 'var', var: '--u3-scale' },
  { name: '강조색', type: 'var', var: '--u3-em' },
];

/** Keep transcription stars literal, including stars that were escaped already (u3 0028). @param {string} text */
const escapeStars = (text) => text.replace(/\\\*|\*/g, star => star === '*' ? '\\*' : star);

/** Copy only missing files; the layer's style and fonts belong to the project after the first import. */
async function copyMissing(/** @type {string} */ from, /** @type {string} */ to) {
  await mkdir(dirname(to), { recursive: true });
  try { await copyFile(from, to, constants.COPYFILE_EXCL); }
  catch (e) { if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'EEXIST') throw e; }
}

/**
 * Import into the current film through its serial, atomic edit path and the existing clip operations.
 * @param {string} root @param {{ src: string, layer?: string }} args
 */
export async function importSubtitles(root, { src, layer = 'layer1' }) {
  if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(layer)) throw new HttpError(400, 'layer must be 1–64 letters, digits, underscores or dashes');
  if (extname(src).toLowerCase() !== '.vtt') throw new HttpError(400, 'subtitles --src must name a .vtt in the project');
  const lines = parseVtt(await readFile(inside(root, src, { read: true }), 'utf8')).lines.sort((a, b) => a.startMs - b.startMs);
  if (!lines.length) throw new HttpError(400, 'the .vtt has no subtitle cues');
  for (let i = 0; i < lines.length; i++) {
    const cue = lines[i];
    if (i + 1 < lines.length) cue.endMs = Math.min(cue.endMs, lines[i + 1].startMs);
    if (cue.startMs < 0 || cue.endMs <= cue.startMs) throw new HttpError(400, 'subtitle cues must have distinct nonnegative starts and positive durations');
  }
  const page = `scenes/u3-subtitle-${layer}.html`;
  const prefix = `u3sub-${layer}-`;
  const sameLayer = (/** @type {import('./ops.mjs').Clip} */ clip) => clip.id.startsWith(prefix) && /^\d+(?:-b)*$/.test(clip.id.slice(prefix.length));
  const clips = lines.map((cue, i) => ({
    id: `${prefix}${i + 1}`, src: page, at: cue.startMs / 1000, time: [0, (cue.endMs - cue.startMs) / 1000],
    attrs: { 'data-props': JSON.stringify(PROPS) },
    overrides: [{ at: '#main-src', text: escapeStars(cue.text) }, { at: '#sub-src', text: '' }],
  }));
  const templates = pagesDir();
  await copyMissing(join(templates, 'u3-subtitle.html'), inside(root, page));
  for (const name of await readdir(join(templates, 'fonts'))) {
    await copyMissing(join(templates, 'fonts', name), inside(root, `scenes/fonts/${name}`));
  }
  await changeProjectFilm(root, (value, current) => {
    if (!current.value) throw new EditError(current.problems.join('\n'), 'invalid');
    const existing = value.tracks.findIndex(track => track.clips.some(sameLayer));
    const track = existing < 0 ? 0 : existing;
    const remove = value.tracks.flatMap(tr => tr.clips.filter(sameLayer).map(clip => ({ op: /** @type {const} */ ('remove'), clip: clip.id })));
    /** @type {import('./ops.mjs').Op[]} */
    const insert = clips.map((clip, i) => ({ op: 'insert', clip, track: existing < 0 && i === 0 ? { insert: track } : track }));
    applyOps(value, [...remove, ...insert]);
    const checked = readFilm(value);
    if (!checked.doc) throw new EditError(checked.problems.join('\n'), 'invalid');
    return { value };
  });
  return { layer, page, clips: clips.map(clip => clip.id), count: clips.length };
}
