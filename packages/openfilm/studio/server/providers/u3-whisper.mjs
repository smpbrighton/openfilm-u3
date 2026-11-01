// @ts-check
/** Local Korean ASR, ported from u3's whisper pipeline and transcript parser. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { inside } from '../files.mjs';
import { needed, round } from './common.mjs';

/** @typedef {import('./contract.mjs').Provider} Provider */
/** @typedef {{url: string, name: string, sha256: string, size: number}} ModelFile */
/** @typedef {(options: {bin: string, args: string[], signal: AbortSignal}) => Promise<void>} Runner */

export const WHISPER_MODEL = Object.freeze({
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin',
  name: 'ggml-large-v3-turbo-q5_0.bin', size: 574_041_195,
  sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
});
export const VAD_MODEL = Object.freeze({
  url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
  name: 'ggml-silero-v6.2.0.bin', size: 885_098,
  sha256: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987',
});
const MODEL_ID = 'large-v3-turbo-q5_0';

/** @param {string} file */
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * Keep interrupted downloads as .part; publish only the pinned size and checksum.
 * @param {ModelFile} file @param {string} destination
 * @param {{signal?: AbortSignal, say?: (line: string) => void, fetch?: typeof fetch}} [options]
 */
export async function downloadModel(file, destination, { signal, say = () => {}, fetch: fetchImpl = fetch } = {}) {
  signal?.throwIfAborted();
  await mkdir(dirname(destination), { recursive: true });
  const valid = async (/** @type {string} */ name) =>
    (await stat(name).catch(() => null))?.size === file.size && await sha256(name) === file.sha256;
  if (await valid(destination)) return destination;
  await rm(destination, { force: true });
  const part = `${destination}.part`;
  let offset = (await stat(part).catch(() => null))?.size ?? 0;
  if (offset >= file.size) {
    if (await valid(part)) { await rename(part, destination); return destination; }
    await rm(part, { force: true });
    offset = 0;
  }
  say(`${file.name}: 모델 받기 ${Math.floor(offset / file.size * 100)}%`);
  const response = await fetchImpl(file.url, { signal, headers: offset ? { Range: `bytes=${offset}-` } : {} });
  if (!response.ok || !response.body) throw new Error(`모델 다운로드 HTTP ${response.status}`);
  if (response.status === 206) {
    const range = /^bytes (\d+)-\d+\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
    if (!range || Number(range[1]) !== offset || Number(range[2]) !== file.size) {
      await response.body.cancel();
      throw new Error('모델 이어받기 범위가 맞지 않습니다');
    }
  } else offset = 0; // A server ignoring Range sends the whole file.
  let received = offset;
  let percent = -1;
  const progress = new Transform({ transform(chunk, _encoding, done) {
    received += chunk.length;
    if (received > file.size) return done(new Error('모델 크기가 맞지 않습니다'));
    const next = Math.floor(received / file.size * 100);
    if (next >= percent + 5) { percent = next; say(`${file.name}: 모델 받기 ${next}%`); }
    done(null, chunk);
  } });
  try {
    await pipeline(response.body, progress, createWriteStream(part, { flags: offset ? 'a' : 'w' }), { signal });
  } catch (error) {
    if (received > file.size) await rm(part, { force: true });
    throw error;
  }
  if (!await valid(part)) {
    await rm(part, { force: true });
    throw new Error('모델 크기 또는 SHA-256 검사가 실패했습니다');
  }
  signal?.throwIfAborted();
  await rename(part, destination);
  say(`${file.name}: 모델 확인 완료`);
  return destination;
}

/** One download per model path, including overlapping subtitle requests. */
const downloads = new Map();
/** @param {ModelFile} file @param {string} dir @param {import('./contract.mjs').RunContext} ctx */
async function modelAt(file, dir, ctx) {
  const destination = join(dir, file.name);
  if (!downloads.has(destination)) downloads.set(destination,
    downloadModel(file, destination, ctx).finally(() => downloads.delete(destination)));
  return downloads.get(destination);
}

/** @param {{model: string, vadModel: string, input: string, outputPrefix: string}} options */
export function whisperArgs({ model, vadModel, input, outputPrefix }) {
  return ['-m', model, '-f', input, '-l', 'ko', '-sns', '--vad', '-vm', vadModel, '-ml', '1', '-sow', '-ojf', '-of', outputPrefix];
}

/** @param {unknown} value @returns {{token: string, start: number, end: number}[]} */
export function parseWhisperOutput(value) {
  const transcription = /** @type {any} */ (value)?.transcription;
  if (!Array.isArray(transcription)) throw new TypeError('whisper JSON에 transcription 배열이 없습니다');
  return transcription.flatMap((segment) => {
    const token = typeof segment?.text === 'string' ? segment.text.trim() : '';
    const start = segment?.offsets?.from;
    const end = segment?.offsets?.to;
    return token && !/^\[_.*\]$/u.test(token) && Number.isFinite(start) && start >= 0 && Number.isFinite(end) && end > start
      ? [{ token, start: start / 1000, end: end / 1000 }] : [];
  });
}

/** @param {{cli?: string, path?: string, platform?: string}} [options] */
export async function findWhisperCli({ cli = process.env.OPENFILM_U3_WHISPER_CLI, path = process.env.PATH ?? '', platform = process.platform } = {}) {
  for (const candidate of cli ? [cli] : path.split(delimiter).filter(Boolean).map((dir) => join(dir, platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'))) {
    if (await access(candidate, constants.X_OK).then(() => true, () => false)) return candidate;
  }
  throw new Error('whisper-cli 를 찾지 못했다. OPENFILM_U3_WHISPER_CLI 또는 PATH를 확인하세요.');
}

/** @type {Runner} */
export function runProcess({ bin, args, signal }) {
  signal.throwIfAborted();
  return new Promise((done, fail) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, signal });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr = (stderr + chunk).slice(-12_000); });
    child.on('error', (error) => fail(Object.assign(new Error(/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT'
      ? `${bin} 를 찾지 못했다` : error.message), { cause: error })));
    child.on('close', (code) => code === 0 ? done() : fail(new Error(`${bin} 실패 (종료 코드 ${code}): ${stderr.trim().slice(-500)}`)));
  });
}

/** Read WAV chunk headers only; the speech itself stays on disk. @param {string} file */
async function wavDuration(file) {
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(16);
    let at = 12;
    let rate = 0;
    while ((await handle.read(header, 0, 8, at)).bytesRead === 8) {
      const size = header.readUInt32LE(4);
      const kind = header.toString('ascii', 0, 4);
      if (kind === 'fmt ') {
        await handle.read(header, 0, 16, at + 8);
        rate = header.readUInt32LE(8);
      }
      if (kind === 'data' && rate) return round(Math.min(size, (await handle.stat()).size - at - 8) / rate);
      at += 8 + size + (size & 1);
    }
    throw new Error('음성 WAV의 길이를 읽지 못했습니다');
  } finally { await handle.close(); }
}

/** Injectable processes/models for tests; production always uses the pinned models. */
export function createWhisperProvider({ run = runProcess, models = modelAt, cli = findWhisperCli } = {}) {
  return /** @type {Provider} */ ({
    id: 'u3-whisper', name: 'u3 Whisper', keyless: true, local: true,
    env: 'OPENFILM_U3_WHISPER_KEY', keysUrl: '', billingUrl: '', verbs: ['asr'],
    models: { asr: [{ id: MODEL_ID, name: 'whisper large-v3-turbo' }] },
    async run(verb, args, ctx) {
      if (verb !== 'asr') throw new Error(`u3 Whisper does not do ${verb}.`);
      const src = needed(args, 'src');
      const input = inside(ctx.root, src);
      ctx.signal.throwIfAborted();
      const bin = await cli(); // Fail before a 574 MB download when the CLI is absent.
      const dir = process.env.OPENFILM_U3_MODELS || join(homedir(), '.openfilm', 'u3', 'models');
      const model = await models(WHISPER_MODEL, dir, ctx);
      const vadModel = await models(VAD_MODEL, dir, ctx);
      const work = await mkdtemp(join(tmpdir(), 'openfilm-u3-whisper-'));
      const wav = join(work, 'audio.wav');
      const outputPrefix = join(work, 'result');
      try {
        ctx.say('u3 Whisper: 음성 변환');
        await run({ bin: 'ffmpeg', args: ['-nostdin', '-y', '-v', 'error', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], signal: ctx.signal });
        const dur = await wavDuration(wav);
        ctx.say('u3 Whisper: 한국어 받아쓰기');
        await run({ bin, args: whisperArgs({ model, vadModel, input: wav, outputPrefix }), signal: ctx.signal });
        const words = parseWhisperOutput(JSON.parse(await readFile(`${outputPrefix}.json`, 'utf8')));
        const text = words.map((word) => word.token).join(' ');
        return { files: [], index: [{ src, dur, text, words, transcribed: true }],
          receipt: { provider: 'u3-whisper', model: MODEL_ID, src, dur, text, words: words.length, language: 'ko' } };
      } finally { await rm(work, { recursive: true, force: true }); }
    },
  });
}

export default createWhisperProvider();
