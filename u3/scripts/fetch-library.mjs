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

export const MEME_EMBED = {
  repo: 'smpbrighton/openfilm-u3',
  tag: 'library-meme-embed-1',
  asset: 'u3-library-meme-embed-1.tar',
  sha256: '4523572bb88d231d662a7d1ceac09a6543cfdab1a8761fd81cc4e6f9b45ca39a',
};

/** What a fetched folder keeps of where it came from. */
const MARK = '.fetched';


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
export const fetchMemes = (library) => fetchAsset(library, MEMES, 'memes');
export const fetchMemeEmbed = (library) => fetchAsset(library, MEME_EMBED, 'meme-embed');

/** @param {string} library @param {typeof MEMES} asset @param {string} folder */
async function fetchAsset(library, asset, folder) {
  const mark = `${asset.tag} ${asset.asset} ${asset.sha256}\n`;
  const memes = join(library, folder);
  if (existsSync(join(memes, MARK)) && readFileSync(join(memes, MARK), 'utf8') === mark) {
    console.log(`u3 library: ${memes} is ${asset.tag} already (sha256 ${asset.sha256.slice(0, 12)}…), skipped`);
    return 'kept';
  }
  mkdirSync(library, { recursive: true });
  const work = mkdtempSync(join(library, '.fetch-'));
  try {
    console.log(`u3 library: downloading ${asset.asset} of ${asset.repo}@${asset.tag}`);
    execFileSync('gh', ['release', 'download', asset.tag, '--repo', asset.repo, '--pattern', asset.asset, '--dir', work], { stdio: 'inherit' });
    const tar = join(work, asset.asset);
    const got = await sha256(tar);
    if (got !== asset.sha256) throw new Error(`u3 library: ${asset.asset} has sha256 ${got}, not ${asset.sha256}`);
    const unpacked = join(work, 'out');
    mkdirSync(unpacked);
    execFileSync('tar', ['-xf', tar, '-C', unpacked], { stdio: 'inherit' });
    const fresh = join(unpacked, folder);
    if (!existsSync(fresh)) throw new Error(`u3 library: ${asset.asset} has no ${folder}/ in it`);
    if (folder === 'meme-embed') {
      const meta = JSON.parse(readFileSync(join(fresh, 'bge-m3.json'), 'utf8'));
      const bytes = readFileSync(join(fresh, 'bge-m3.f32'));
      if (meta.model !== 'bge-m3' || meta.dim !== 1024 || meta.items?.length !== 2195 || bytes.length !== meta.items.length * meta.dim * 4) throw new Error('u3 meme index: invalid dimensions or size');
    }
    const { mp4, json } = folder === 'memes' ? count(fresh) : { mp4: 0, json: 1 };
    writeFileSync(join(fresh, MARK), mark);
    rmSync(memes, { recursive: true, force: true });
    renameSync(fresh, memes);
    console.log(`u3 library: ${mp4} mp4 + ${json} json in ${memes}`);
    return 'fetched';
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--into');
  const library = at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'library');
  Promise.resolve().then(() => fetchMemes(library)).then(() => fetchMemeEmbed(library)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
