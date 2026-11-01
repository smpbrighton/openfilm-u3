#!/usr/bin/env node
// @ts-check
/**
 * Fetch u3's meme library into `u3/library/memes` (git-ignored: 212 MB). The library is one tar on a GitHub Release
 * of the private repo, pinned here by tag, asset name and sha256: `gh release download` (it needs `gh auth login`),
 * the hash checked, then unpacked. A library already fetched from the same tar (its `.fetched` says the hash) is
 * left as it is.
 *
 *   node u3/scripts/fetch-library.mjs                 → <repo>/u3/library/memes
 *   node u3/scripts/fetch-library.mjs --into <dir>    → <dir>/memes
 *
 * Exits non-zero on any failure (the desktop release build stops there). How the tar is made: u3/library/README.md.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MEMES = {
  repo: 'smpbrighton/openfilm-u3',
  tag: 'library-memes-1',
  asset: 'u3-library-memes-1.tar',
  sha256: '65aa3f9dc4f8c1378c71ac5e02426b48a2036cf494b9d37abd8c21e56c872a2f',
};

/** What a fetched folder keeps of where it came from. */
const MARK = '.fetched';
const mark = `${MEMES.tag} ${MEMES.asset} ${MEMES.sha256}\n`;

/** @param {string} path @returns {Promise<string>} */
function sha256(path) {
  return new Promise((done, fail) => {
    const hash = createHash('sha256');
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('error', fail).on('end', () => done(hash.digest('hex')));
  });
}

/** mp4 and json files under `dir`, counted. @param {string} dir */
function count(dir) {
  let mp4 = 0;
  let json = 0;
  for (const emotion of readdirSync(dir, { withFileTypes: true })) {
    if (!emotion.isDirectory()) continue;
    for (const name of readdirSync(join(dir, emotion.name))) {
      if (name.endsWith('.mp4')) mp4 += 1;
      else if (name.endsWith('.json')) json += 1;
    }
  }
  return { mp4, json };
}

/** @param {string} library the folder `memes/` goes in @returns {Promise<'kept' | 'fetched'>} */
export async function fetchMemes(library) {
  const memes = join(library, 'memes');
  if (existsSync(join(memes, MARK)) && readFileSync(join(memes, MARK), 'utf8') === mark) {
    console.log(`u3 memes: ${memes} is ${MEMES.tag} already (sha256 ${MEMES.sha256.slice(0, 12)}…), skipped`);
    return 'kept';
  }
  mkdirSync(library, { recursive: true });
  const work = mkdtempSync(join(library, '.fetch-'));
  try {
    console.log(`u3 memes: downloading ${MEMES.asset} of ${MEMES.repo}@${MEMES.tag}`);
    execFileSync('gh', ['release', 'download', MEMES.tag, '--repo', MEMES.repo, '--pattern', MEMES.asset, '--dir', work], { stdio: 'inherit' });
    const tar = join(work, MEMES.asset);
    const got = await sha256(tar);
    if (got !== MEMES.sha256) throw new Error(`u3 memes: ${MEMES.asset} has sha256 ${got}, not ${MEMES.sha256}`);
    const unpacked = join(work, 'out');
    mkdirSync(unpacked);
    execFileSync('tar', ['-xf', tar, '-C', unpacked], { stdio: 'inherit' });
    const fresh = join(unpacked, 'memes');
    if (!existsSync(fresh)) throw new Error(`u3 memes: ${MEMES.asset} has no memes/ in it`);
    const { mp4, json } = count(fresh);
    writeFileSync(join(fresh, MARK), mark);
    rmSync(memes, { recursive: true, force: true });
    renameSync(fresh, memes);
    console.log(`u3 memes: ${mp4} mp4 + ${json} json in ${memes}`);
    return 'fetched';
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--into');
  const library = at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'library');
  fetchMemes(library).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
