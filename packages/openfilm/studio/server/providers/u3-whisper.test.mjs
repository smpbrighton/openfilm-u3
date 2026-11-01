import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wav } from './common.mjs';
import { createWhisperProvider, downloadModel, findWhisperCli, parseWhisperOutput, runProcess, whisperArgs } from './u3-whisper.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/u3-whisper-output.json', import.meta.url), 'utf8'));
const scratch = (t) => { const dir = mkdtempSync(join(tmpdir(), 'of-u3-whisper-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
const bytes = Buffer.from('pinned model bytes');
const file = { name: 'model.bin', url: 'https://model.invalid/model.bin', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
const response = (body = bytes, options) => new Response(body, options);

test('fixture: segment times use source offsets, not VAD-compressed token times', () => {
  const words = parseWhisperOutput(fixture);
  assert.equal(words.length, 39);
  assert.deepEqual(words[0], { token: '오늘은', start: 1, end: 1.32 });
  const later = words.find((w) => w.token === '정도');
  assert.deepEqual(later, { token: '정도', start: 18.11, end: 18.33 });
});

test('empty, special, invalid and zero-length segments are discarded', () => {
  const segment = (text, from = 0, to = 100) => ({ text, offsets: { from, to } });
  assert.deepEqual(parseWhisperOutput({ transcription: [segment(''), segment(' '), segment('[_BEG_]'), segment('[_TT_530]'), segment('영', 100, 100), segment('음', -1), segment('잘못', '1'), segment('좋아요', 200, 400), null] }), [{ token: '좋아요', start: 0.2, end: 0.4 }]);
  assert.throws(() => parseWhisperOutput({}), /transcription 배열/);
});

test('Korean word-level VAD arguments match the u3 pipeline', () => {
  assert.deepEqual(whisperArgs({ model: 'm', vadModel: 'v', input: 'a.wav', outputPrefix: 'out' }), ['-m', 'm', '-f', 'a.wav', '-l', 'ko', '-sns', '--vad', '-vm', 'v', '-ml', '1', '-sow', '-ojf', '-of', 'out']);
});

test('run: WAV conversion uses a project path without ctx.read, lands ASR rows, and cleans temporary files', async (t) => {
  const root = scratch(t);
  writeFileSync(join(root, 'talk.mp4'), 'input');
  const calls = [], seenModels = [], said = [];
  const signal = new AbortController().signal;
  const provider = createWhisperProvider({ cli: async () => '/bin/whisper-cli', models: async (file, dir) => { seenModels.push(file.name); return join(dir, file.name); }, run: async (call) => {
    calls.push(call);
    assert.equal(call.signal, signal);
    if (call.bin === 'ffmpeg') writeFileSync(call.args.at(-1), wav(new Uint8Array(64000), 16000));
    else writeFileSync(`${call.args.at(-1)}.json`, JSON.stringify(fixture));
  } });
  const result = await provider.run('asr', { src: 'talk.mp4' }, { root, signal, key: '', say: (line) => said.push(line), read: async () => { throw new Error('48 MB reader must not run'); } });
  const words = parseWhisperOutput(fixture);
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.index, [{ src: 'talk.mp4', dur: 2, text: words.map((w) => w.token).join(' '), words, transcribed: true }]);
  assert.deepEqual(seenModels, ['ggml-large-v3-turbo-q5_0.bin', 'ggml-silero-v6.2.0.bin']);
  assert.deepEqual(calls[0].args.slice(5, -1), [join(root, 'talk.mp4'), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le']);
  assert.equal(existsSync(calls[0].args.at(-1)), false);
  assert.equal(result.receipt.language, 'ko');
  assert.equal(said.length, 2);
});

test('failed or cancelled processes leave no temporary speech', async (t) => {
  const root = scratch(t);
  writeFileSync(join(root, 'talk.wav'), 'input');
  let temporary;
  const provider = createWhisperProvider({ cli: async () => 'whisper-cli', models: async (file) => file.name, run: async ({ args }) => { temporary = args.at(-1); throw new Error('conversion failed'); } });
  const ctx = { root, key: '', signal: new AbortController().signal, say() {}, read: async () => new Uint8Array() };
  await assert.rejects(provider.run('asr', { src: 'talk.wav' }, ctx), /conversion failed/);
  assert.equal(existsSync(temporary), false);
  await assert.rejects(provider.run('asr', { src: '../elsewhere.wav' }, ctx), /not a path inside/);
});

test('missing CLI has a sentence and fails before models are requested', async (t) => {
  await assert.rejects(findWhisperCli({ cli: '/missing/whisper-cli', path: '' }), /whisper-cli 를 찾지 못했다/);
  await assert.rejects(findWhisperCli({ cli: '', path: '' }), /whisper-cli 를 찾지 못했다/);
  const provider = createWhisperProvider({ cli: () => findWhisperCli({ cli: '/missing/whisper-cli' }), models: async () => { assert.fail('no download'); } });
  const root = scratch(t);
  writeFileSync(join(root, 'talk.wav'), 'input');
  await assert.rejects(provider.run('asr', { src: 'talk.wav' }, { root, key: '', signal: new AbortController().signal, say() {}, read: async () => new Uint8Array() }), /whisper-cli 를 찾지 못했다/);
});

test('download: pinned size and hash, progress, and an already verified model makes no request', async (t) => {
  const dest = join(scratch(t), 'model.bin'), said = [];
  await downloadModel(file, dest, { fetch: async () => response(), say: (line) => said.push(line) });
  assert.deepEqual(readFileSync(dest), bytes);
  assert.equal(existsSync(`${dest}.part`), false);
  assert.match(said.at(-1), /확인 완료/);
  await downloadModel(file, dest, { fetch: async () => assert.fail('already verified') });
});

test('download resumes .part with a checked Range and restarts if Range is ignored', async (t) => {
  const dest = join(scratch(t), 'model.bin');
  writeFileSync(`${dest}.part`, bytes.subarray(0, 5));
  await downloadModel(file, dest, { fetch: async (_url, init) => {
    assert.equal(init.headers.Range, 'bytes=5-');
    return response(bytes.subarray(5), { status: 206, headers: { 'content-range': `bytes 5-${bytes.length - 1}/${bytes.length}` } });
  } });
  assert.deepEqual(readFileSync(dest), bytes);
  rmSync(dest);
  writeFileSync(`${dest}.part`, bytes.subarray(0, 5));
  await downloadModel(file, dest, { fetch: async () => response() });
  assert.deepEqual(readFileSync(dest), bytes);
});

test('a complete .part is verified without a request; a wrong resume range is refused', async (t) => {
  const dest = join(scratch(t), 'model.bin');
  writeFileSync(`${dest}.part`, bytes);
  await downloadModel(file, dest, { fetch: async () => assert.fail('complete part') });
  rmSync(dest);
  writeFileSync(`${dest}.part`, bytes.subarray(0, 5));
  await assert.rejects(downloadModel(file, dest, { fetch: async () => response(bytes.subarray(5), { status: 206, headers: { 'content-range': `bytes 0-1/${bytes.length}` } }) }), /범위가 맞지/);
  assert.equal(existsSync(dest), false);
});

test('wrong hash, wrong size and corrupt cache never become a model', async (t) => {
  for (const body of [Buffer.alloc(bytes.length), Buffer.from('short'), Buffer.alloc(bytes.length + 1)]) {
    const dest = join(scratch(t), 'model.bin');
    writeFileSync(dest, 'corrupt cache');
    await assert.rejects(downloadModel(file, dest, { fetch: async () => response(body) }), /크기|SHA-256/);
    assert.equal(existsSync(dest), false);
    assert.equal(existsSync(`${dest}.part`), false);
  }
});

test('an interrupted stream keeps only its partial bytes and the next request resumes them', async (t) => {
  const dest = join(scratch(t), 'model.bin');
  await assert.rejects(downloadModel(file, dest, { fetch: async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 5));
      setTimeout(() => controller.error(new Error('connection lost')), 30);
    },
  })) }), /connection lost/);
  assert.equal(existsSync(dest), false);
  assert.deepEqual(readFileSync(`${dest}.part`), bytes.subarray(0, 5));
  await downloadModel(file, dest, { fetch: async (_url, init) => {
    assert.equal(init.headers.Range, 'bytes=5-');
    return response(bytes.subarray(5), { status: 206, headers: { 'content-range': `bytes 5-${bytes.length - 1}/${bytes.length}` } });
  } });
  assert.deepEqual(readFileSync(dest), bytes);
});

test('cancel before downloading or running starts no work', async (t) => {
  const signal = AbortSignal.abort(new Error('cancelled'));
  await assert.rejects(downloadModel(file, join(scratch(t), 'model.bin'), { signal, fetch: async () => assert.fail('cancelled') }), /cancelled/);
  assert.throws(() => runProcess({ bin: process.execPath, args: [], signal }), /cancelled/);
});

test('runner reports nonzero exits and stops an active child on cancellation', async () => {
  await assert.rejects(runProcess({ bin: process.execPath, args: ['-e', 'process.stderr.write("bad input"); process.exit(7)'], signal: new AbortController().signal }), /종료 코드 7.*bad input/);
  const stop = new AbortController();
  const running = runProcess({ bin: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], signal: stop.signal });
  stop.abort();
  await assert.rejects(running, /aborted/);
});
