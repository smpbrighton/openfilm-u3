/** Plain minisign, including the signature over the trusted comment. No external crypto/runtime dependency. */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';

function decode(text, size) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new Error('Invalid minisign base64');
  const bytes = Buffer.from(text, 'base64');
  if (bytes.length !== size || bytes.toString('base64') !== text) throw new Error('Invalid minisign packet');
  return bytes;
}

function parse(publicKey, signature) {
  const keys = String(publicKey).trim().split(/\r?\n/);
  if (keys.length !== 1 && (keys.length !== 2 || !keys[0].startsWith('untrusted comment: '))) throw new Error('Invalid minisign public key');
  const pk = decode(keys.at(-1), 42);
  if (pk.subarray(0, 2).toString() !== 'Ed') throw new Error('Invalid minisign key algorithm');
  if (typeof signature !== 'string' || signature.length > 8192) throw new Error('Invalid minisign signature');
  const lines = signature.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  if (lines.length !== 4 || !lines[0].startsWith('untrusted comment: ') || !lines[2].startsWith('trusted comment: ')) throw new Error('Invalid minisign signature');
  const packet = decode(lines[1], 74);
  const algorithm = packet.subarray(0, 2).toString();
  if (!['Ed', 'ED'].includes(algorithm) || !pk.subarray(2, 10).equals(packet.subarray(2, 10))) throw new Error('Minisign key mismatch');
  const comment = lines[2].slice('trusted comment: '.length);
  if (/[\x00-\x08\x0a-\x1f\x7f]/.test(comment)) throw new Error('Invalid trusted comment');
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pk.subarray(10)]), format: 'der', type: 'spki' });
  const sig = packet.subarray(10);
  if (!verify(null, Buffer.concat([sig, Buffer.from(comment, 'utf8')]), key, decode(lines[3], 64))) throw new Error('Invalid trusted comment signature');
  return { algorithm, comment, key, sig };
}

function verifyPayload(data, parsed) {
  if (!verify(null, data, parsed.key, parsed.sig)) throw new Error('Invalid installer signature');
  return parsed.comment;
}

export function verifyMinisign(data, signature, publicKey) {
  const parsed = parse(publicKey, signature);
  return verifyPayload(parsed.algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data, parsed);
}

/** Modern minisign streams large installers into Blake2b; legacy Ed requires the original bytes. */
export async function verifyMinisignFile(path, signature, publicKey) {
  const parsed = parse(publicKey, signature);
  if (parsed.algorithm === 'Ed') return verifyPayload(await readFile(path), parsed);
  const hash = createHash('blake2b512');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return verifyPayload(hash.digest(), parsed);
}

export function signedVersion(comment) {
  const fields = comment.split('\t').filter((field) => field.startsWith('version:'));
  if (fields.length !== 1 || !/^version:\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(fields[0])) throw new Error('Invalid signed version');
  return fields[0].slice('version:'.length);
}
