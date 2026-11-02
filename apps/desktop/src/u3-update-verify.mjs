/** Windows' electron-updater hook: null accepts; a fixed string refuses, without host messages or URLs. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix } from 'node:path';
import { PrehashedMinisignError, signedVersion, verifyMinisignFile } from './u3-minisign.mjs';

const require = createRequire(import.meta.url);
const buildProduct = () => JSON.parse(readFileSync(join(dirname(require.resolve('openfilm/package.json')), 'product.json'), 'utf8'));

export function createWindowsUpdateVerifier(updater, { product = buildProduct(), fetch = globalThis.fetch, arch = process.arch } = {}) {
  const publicKey = product.desktop?.minisignPublicKey;
  const feed = product.desktop?.updates;
  let available = null;
  updater.on('checking-for-update', () => { available = null; });
  updater.on('update-not-available', () => { available = null; });
  updater.on('update-available', (info) => {
    /* Match NsisUpdater's findFile selection; the downloaded path is temp-<name>.exe, not a release asset. */
    try {
      const files = (info.files ?? (info.path ? [{ url: info.path }] : [])).map((f) => new URL(f.url, `${feed}/`)).filter((url) => url.pathname.toLowerCase().endsWith('.exe'));
      const file = files.find((url) => url.pathname.includes(arch)) ?? files[0];
      available = { version: info.version, name: file ? posix.basename(decodeURIComponent(file.pathname)) : null };
    } catch { available = null; }
  });
  return async (_publisherNames, path) => {
    if (typeof publicKey !== 'string' || !publicKey.trim()) return 'Update signing key is not configured';
    const target = available;
    if (!target?.version || !target.name || !/^[^/\\\x00-\x1f]+\.exe$/i.test(target.name)) return 'Update signature metadata is missing';
    try {
      const base = new URL(`${feed.replace(/\/+$/, '')}/`);
      if (base.protocol !== 'https:') return 'Update signing feed is invalid';
      const response = await fetch(new URL(`${encodeURIComponent(target.name)}.minisig`, base), { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) return 'Update signature could not be loaded';
      /* Signature files are four short lines; bound a streaming response before decoding it. */
      const chunks = []; let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 8192) return 'Update signature is too large';
        chunks.push(chunk);
      }
      const comment = await verifyMinisignFile(path, Buffer.concat(chunks).toString('utf8'), publicKey);
      if (signedVersion(comment) !== target.version) return 'Update signed version does not match';
      return null;
    } catch (error) {
      return error instanceof PrehashedMinisignError ? error.message : 'Update signature verification failed';
    }
  };
}
