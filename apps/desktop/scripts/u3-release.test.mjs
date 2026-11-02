import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRelease, writeFragment } from './u3-release.mjs';

const fixture = (name) => new URL(`../fixtures/u3-minisign/${name}`, import.meta.url);
const version = '0.2.8'; const commit = 'a'.repeat(40);
const publicKey = readFileSync(fixture('test.pub'), 'utf8');
async function release(t, macOnly = false) {
  const dir = mkdtempSync(join(tmpdir(), 'u3-release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const target of macOnly ? ['arm64-mac', 'x64-mac'] : ['arm64-mac', 'x64-mac', 'win-x64']) {
    const files = [];
    for (const ext of target.startsWith('win') ? ['exe'] : ['zip', 'dmg']) {
      const name = `OpenFilm-${target}.${ext}`;
      copyFileSync(fixture('installer.bin'), join(dir, name));
      files.push({ url: name, sha512: createHash('sha512').update(readFileSync(join(dir, name))).digest('base64'), size: readFileSync(join(dir, name)).length });
      if (ext === 'exe') copyFileSync(fixture('legacy.minisig'), join(dir, `${name}.minisig`));
    }
    writeFileSync(join(dir, `latest-${target}.yml`), JSON.stringify({ version, files, path: files[0].url, sha512: files[0].sha512 }));
  }
  await writeFragment('mac', version, commit, dir, { publicKey });
  if (!macOnly) await writeFragment('windows', version, commit, dir, { publicKey });
  return dir;
}

test('both platform fragments validate their feeds, signed version and every uploaded byte', async (t) => {
  const dir = await release(t);
  await checkRelease(version, commit, dir, { publicKey });
  assert.match(readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8'), /windows.fragment.json/);
  writeFileSync(join(dir, 'OpenFilm-win-x64.exe'), 'tampered');
  await assert.rejects(checkRelease(version, commit, dir, { publicKey }), /hash mismatch/);
});

test('missing or mismatched fragment prevents publication', async (t) => {
  const dir = await release(t);
  await assert.rejects(checkRelease(version, 'b'.repeat(40), dir, { publicKey }), /identity/);
  rmSync(join(dir, 'windows.fragment.json'));
  await assert.rejects(checkRelease(version, commit, dir, { publicKey }));
});

test('Mac-only succeeds with no Windows feed; accidental Windows assets prevent publication', async (t) => {
  const dir = await release(t, true);
  await checkRelease(version, commit, dir, { macOnly: true, publicKey: '' });
  await assert.rejects(checkRelease(version, commit, dir, { publicKey }));
  writeFileSync(join(dir, 'latest-win-x64.yml'), 'stale');
  await assert.rejects(checkRelease(version, commit, dir, { macOnly: true }), /Unexpected/);
});

test('unsigned or wrong-version Windows installers cannot produce a fragment', async (t) => {
  const dir = await release(t);
  await assert.rejects(writeFragment('windows', version, commit, dir, { publicKey: '' }));
  writeFileSync(join(dir, 'OpenFilm-win-x64.exe.minisig'), readFileSync(fixture('legacy.minisig'), 'utf8').replace('version:0.2.8', 'version:0.2.9'));
  await assert.rejects(writeFragment('windows', version, commit, dir, { publicKey }));
});

test('prehashed ED Windows signatures cannot produce a fragment', async (t) => {
  const dir = await release(t);
  copyFileSync(fixture('prehashed.minisig'), join(dir, 'OpenFilm-win-x64.exe.minisig'));
  await assert.rejects(writeFragment('windows', version, commit, dir, { publicKey }), /prehashed.*ED.*not supported.*legacy Ed/i);
});

test('publication rejects ED even when the fragment records the signature hash', async (t) => {
  const dir = await release(t);
  const name = 'OpenFilm-win-x64.exe.minisig';
  copyFileSync(fixture('prehashed.minisig'), join(dir, name));
  const path = join(dir, 'windows.fragment.json');
  const fragment = JSON.parse(readFileSync(path, 'utf8'));
  fragment.assets[name] = createHash('sha256').update(readFileSync(join(dir, name))).digest('hex');
  writeFileSync(path, JSON.stringify(fragment));
  await assert.rejects(checkRelease(version, commit, dir, { publicKey }), /prehashed.*ED.*not supported.*legacy Ed/i);
});

test('feed version, traversal and omitted assets fail before checksums are written', async (t) => {
  const dir = await release(t);
  const file = join(dir, 'latest-win-x64.yml'); const info = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...info, version: '0.2.9' }));
  await assert.rejects(writeFragment('windows', version, commit, dir, { publicKey }), /version/);
  writeFileSync(file, JSON.stringify({ ...info, files: [{ ...info.files[0], url: '../outside.exe' }] }));
  await assert.rejects(writeFragment('windows', version, commit, dir, { publicKey }), /name/);
});
