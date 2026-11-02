import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyMinisign, verifyMinisignFile, signedVersion } from './u3-minisign.mjs';

const fixture = (name) => new URL(`../fixtures/u3-minisign/${name}`, import.meta.url);
const bytes = readFileSync(fixture('installer.bin'));
const key = readFileSync(fixture('test.pub'), 'utf8');
const signature = readFileSync(fixture('legacy.minisig'), 'utf8');

test('a changed payload, key, trusted comment or global signature is rejected', () => {
  const changed = Buffer.from(bytes); changed[0] ^= 1;
  assert.throws(() => verifyMinisign(changed, signature, key));
  const packet = Buffer.from(key.trim().split('\n')[1], 'base64'); packet[20] ^= 1;
  assert.throws(() => verifyMinisign(bytes, signature, packet.toString('base64')));
  assert.throws(() => verifyMinisign(bytes, signature.replace('version:0.2.8', 'version:0.2.9'), key));
  const lines = signature.trim().split('\n');
  const global = Buffer.from(lines[3], 'base64'); global[0] ^= 1; lines[3] = global.toString('base64');
  assert.throws(() => verifyMinisign(bytes, lines.join('\n'), key));
});

test('malformed signatures and empty or malformed public keys fail closed', () => {
  for (const value of ['', 'broken', Buffer.from(signature).toString('base64'), signature + 'extra\n', signature.replace('trusted comment:', 'comment:')]) {
    assert.throws(() => verifyMinisign(bytes, value, key));
  }
  for (const value of ['', ' ', 'broken', key.trim().split('\n')[1] + '!']) assert.throws(() => verifyMinisign(bytes, signature, value));
});

test('minisign CLI legacy Ed fixture verifies in memory and from disk', async () => {
  const sig = signature;
  assert.equal(signedVersion(verifyMinisign(bytes, sig, key)), '0.2.8');
  assert.equal(signedVersion(await verifyMinisignFile(fixture('installer.bin'), sig, key.trim().split('\n')[1])), '0.2.8');
  assert.equal(signedVersion(verifyMinisign(bytes, sig.replaceAll('\n', '\r\n'), key)), '0.2.8');
});

test('prehashed ED signatures are rejected explicitly before reading installer bytes', async () => {
  const sig = readFileSync(fixture('prehashed.minisig'), 'utf8');
  const reason = /prehashed.*ED.*not supported.*legacy Ed/i;
  assert.throws(() => verifyMinisign(bytes, sig, key), reason);
  await assert.rejects(verifyMinisignFile('/missing-installer.exe', sig, key), reason);
});

test('signed version must be a single complete field', () => {
  for (const comment of ['timestamp:1', 'notversion:0.2.8', 'version:0.2.8\tversion:0.2.8', 'version:0.2.8 extra']) assert.throws(() => signedVersion(comment));
});
