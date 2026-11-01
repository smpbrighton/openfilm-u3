// @ts-check
/**
 * u3 Library: sound effects and reaction memes from u3's bundled library (u3-library.mjs), found, not made. No key and
 * no network: the library is on this computer. `--prompt` is scored with u3's own rules and the best one is the file;
 * equal scores have one order, so one prompt always gives one file. `--sec` is not honored (the receipt says so): a
 * sound is as long as it is. A meme the film uses already (its film.html's video clips, by their bytes) is not picked
 * again, so the same prompt and the same film.html give the same meme.
 */
import { readFile } from 'node:fs/promises';
import { landing, needed, notes, number, text } from './common.mjs';
import { FILM_FILE } from '../../../src/film-doc.mjs';
import { MEME_EMOTIONS, libraryDir, listMemes, listSfx, matchMemes, memesInFilm, noLibrary, noMemes, rankSfx } from '../u3-library.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */

const NAME = 'u3 Library';
/** How many of the best the receipt names. */
const CANDIDATES = 5;

/** @type {Provider} */
export default {
  id: 'u3-library',
  name: NAME,
  env: 'OPENFILM_U3_LIBRARY_KEY',
  keysUrl: '',
  billingUrl: '',
  verbs: ['sfx', 'meme'],
  /* one each, so Settings → Models has it to pick: what is found is the library, not a model's */
  models: { sfx: [{ id: 'library', name: 'u3 library' }], meme: [{ id: 'library', name: 'u3 library' }] },
  keyless: true,
  local: true,
  async run(verb, args, ctx) {
    if (verb === 'meme') return meme(args, ctx);
    if (verb !== 'sfx') throw new Error(`${NAME} does not do ${verb}.`);
    const prompt = needed(args, 'prompt');
    const path = landing('audio/sfx', args.out, 'mp3');
    const dir = libraryDir();
    const items = await listSfx(dir);
    if (!items?.length) throw new Error(noLibrary(dir));
    const ranked = rankSfx(prompt, items);
    if (!ranked[0].score) {
      const categories = [...new Set(items.map((i) => i.category))].sort();
      throw new Error(`Nothing in the u3 library fits "${prompt}": describe the moment (놀람, 반전, 실패, 웃음 …) or name a category (${categories.join(', ')}).`);
    }
    const best = ranked[0].item;
    if (ctx.signal.aborted) throw ctx.signal.reason ?? new Error('stopped');
    const bytes = new Uint8Array(await readFile(best.path));
    const dur = best.durationSec;
    return {
      files: [{ path, bytes }],
      index: [{ src: path, kind: 'audio', ...(dur !== null ? { dur } : {}), from: { mode: 'library', prompt, provider: 'u3-library', id: best.id } }],
      receipt: {
        provider: 'u3-library', id: best.id, title: best.title, category: best.category, src: path, dur,
        candidates: ranked.slice(0, CANDIDATES).map(({ item, score }) => ({ id: item.id, title: item.title, category: item.category, score })),
        ...notes(number(args.sec) !== null ? ['--sec is not honored: a library sound is as long as it is'] : []),
      },
    };
  },
};

/**
 * The meme that fits the scene best, of those the film does not use yet.
 * @param {Record<string, unknown>} args @param {import('./contract.mjs').RunContext} ctx
 * @returns {Promise<import('./contract.mjs').RunResult>}
 */
async function meme(args, ctx) {
  const prompt = needed(args, 'prompt');
  const reaction = text(args.reaction);
  const path = landing('video/memes', args.out, 'mp4');
  const dir = libraryDir();
  const items = await listMemes(dir);
  if (!items?.length) throw new Error(noMemes(dir));
  /** @type {string} */
  let film = '';
  try { film = new TextDecoder().decode(await ctx.read(FILM_FILE)); } catch { /* no film yet: nothing is used */ }
  const used = film ? await memesInFilm(ctx.root, film, items) : [];
  const visual = { query: prompt, ...(reaction ? { reaction } : {}) };
  const ranked = matchMemes(visual, items, CANDIDATES, { exclude: used });
  if (!ranked[0]?.score) {
    throw new Error(`Nothing in the u3 library fits "${prompt}"${used.length ? ` that the film does not use already (${used.length} used)` : ''}: describe the scene with a feeling, or name one with --reaction (${Object.values(MEME_EMOTIONS).join(', ')}).`);
  }
  const best = ranked[0].meme;
  if (ctx.signal.aborted) throw ctx.signal.reason ?? new Error('stopped');
  const bytes = new Uint8Array(await readFile(best.path));
  const { durationSec: dur, width, height } = best;
  return {
    files: [{ path, bytes }],
    index: [{
      src: path, kind: 'video', ...(width && height ? { w: width, h: height } : {}), ...(dur !== null ? { dur } : {}), hasAudio: false,
      from: { mode: 'library', provider: 'u3-library', id: best.id, prompt },
    }],
    receipt: {
      provider: 'u3-library', id: best.id, emotion: best.emotion, description: best.description, src: path, dur, width, height,
      ...(used.length ? { excluded: used } : {}),
      candidates: ranked.map(({ meme: m, score }) => ({ id: m.id, emotion: m.emotion, score })),
    },
  };
}
