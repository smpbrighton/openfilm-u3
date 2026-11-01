// @ts-check
/**
 * u3 Library: sound effects from u3's bundled library (u3-library.mjs), found, not made. No key and no network: the
 * library is on this computer. `--prompt` is scored with u3's own rules and the best one is the file; equal scores go
 * by id, so one prompt always gives one file. `--sec` is not honored (the receipt says so): a sound is as long as it is.
 */
import { readFile } from 'node:fs/promises';
import { landing, needed, notes, number } from './common.mjs';
import { libraryDir, listSfx, noLibrary, rankSfx } from '../u3-library.mjs';

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
  verbs: ['sfx'],
  keyless: true,
  async run(verb, args, ctx) {
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
