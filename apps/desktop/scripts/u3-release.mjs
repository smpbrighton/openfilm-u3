/** Release fragments bind the source commit, feeds, installers and signatures before a draft can be published. */
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signedVersion, verifyMinisignFile } from '../src/u3-minisign.mjs';

const require = createRequire(import.meta.url);
// Use the same YAML parser as the pinned updater; no additional shipped dependency.
const { load } = createRequire(require.resolve('electron-updater'))('js-yaml');
const product = () => JSON.parse(readFileSync(new URL('../../../packages/openfilm/product.official.json', import.meta.url), 'utf8'));
const safeName = (name) => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
const fail = (message) => { throw new Error(message); };

function identity(version, commit) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) || !/^[a-f0-9]{40}$/.test(commit)) fail('Invalid release version or commit');
}

async function digest(file, algorithm = 'sha256', encoding = 'hex') {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest(encoding);
}

async function platformAssets(platform, version, dir, publicKey) {
  const channels = platform === 'mac' ? ['latest-arm64-mac.yml', 'latest-x64-mac.yml'] : platform === 'windows' ? ['latest-win-x64.yml'] : fail('Invalid release platform');
  const assets = new Set(channels);
  for (const channel of channels) {
    const info = load(readFileSync(join(dir, channel), 'utf8'));
    if (info?.version !== version || !Array.isArray(info.files) || !info.files.length) fail('Feed version or files are missing');
    const suffix = platform === 'mac' ? channel.includes('arm64') ? 'arm64' : 'x64' : 'x64';
    const extensions = new Set();
    for (const file of info.files) {
      if (!safeName(file.url) || !file.url.includes(suffix) || !/\.(zip|dmg|exe)$/.test(file.url)) fail('Invalid feed asset name');
      const ext = file.url.split('.').at(-1);
      if (platform === 'mac' ? !['zip', 'dmg'].includes(ext) : ext !== 'exe') fail('Wrong platform installer');
      if (await digest(join(dir, file.url), 'sha512', 'base64') !== file.sha512) fail('Feed asset hash mismatch');
      const { size } = await stat(join(dir, file.url));
      if (size !== file.size) fail('Feed asset size mismatch');
      extensions.add(ext); assets.add(file.url);
      if (platform === 'windows') {
        const sig = `${file.url}.minisig`;
        const comment = await verifyMinisignFile(join(dir, file.url), readFileSync(join(dir, sig), 'utf8'), publicKey);
        if (signedVersion(comment) !== version) fail('Installer signed version mismatch');
        assets.add(sig);
      }
    }
    if (platform === 'mac' ? !extensions.has('zip') || !extensions.has('dmg') : !extensions.has('exe')) fail('Required installer is missing');
    // Legacy path/sha512 must identify the same installer that the updater will choose.
    if (!info.files.some((file) => file.url === info.path && file.sha512 === info.sha512)) fail('Feed primary installer mismatch');
  }
  for (const name of readdirSync(dir)) if (name.endsWith('.blockmap') && assets.has(name.slice(0, -'.blockmap'.length))) assets.add(name);
  return [...assets].sort();
}

export async function writeFragment(platform, version, commit, dir, { publicKey = product().desktop.minisignPublicKey } = {}) {
  identity(version, commit);
  const names = await platformAssets(platform, version, dir, publicKey);
  const assets = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await digest(join(dir, name))])));
  const fragment = { version, commit, platform, assets };
  writeFileSync(join(dir, `${platform}.fragment.json`), `${JSON.stringify(fragment, null, 2)}\n`);
  return fragment;
}

export async function checkRelease(version, commit, dir, { macOnly = false, publicKey = product().desktop.minisignPublicKey } = {}) {
  identity(version, commit);
  const platforms = macOnly ? ['mac'] : ['mac', 'windows'];
  const expected = new Set();
  for (const platform of platforms) {
    const name = `${platform}.fragment.json`;
    const fragment = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    if (fragment.version !== version || fragment.commit !== commit || fragment.platform !== platform) fail('Fragment identity mismatch');
    const names = await platformAssets(platform, version, dir, publicKey);
    if (JSON.stringify(Object.keys(fragment.assets).sort()) !== JSON.stringify(names)) fail('Fragment asset list mismatch');
    for (const asset of names) {
      if (!safeName(asset) || expected.has(asset) || await digest(join(dir, asset)) !== fragment.assets[asset]) fail('Fragment asset hash mismatch');
      expected.add(asset);
    }
    expected.add(name);
  }
  // Mac-only must omit Windows feeds, and no stray files (including source or keys) go public.
  if (readdirSync(dir).some((name) => !expected.has(name) && name !== 'SHA256SUMS.txt')) fail('Unexpected release asset');
  const lines = await Promise.all([...expected].sort().map(async (name) => `${await digest(join(dir, name))}  ${name}`));
  writeFileSync(join(dir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
  return [...expected].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'fragment' && args.length === 4) await writeFragment(...args);
    else if (command === 'check' && (args.length === 3 || args.length === 4 && args[3] === '--mac-only')) await checkRelease(...args.slice(0, 3), { macOnly: args[3] === '--mac-only' });
    else fail('Usage: u3-release.mjs fragment mac|windows <version> <commit> <dir> | check <version> <commit> <dir> [--mac-only]');
    console.log(`✓ release ${command} passed`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
