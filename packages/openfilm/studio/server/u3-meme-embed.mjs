/** Local bge-m3 search. No model or desktop modules: the caller keeps the rule ranking. Never downloads on search. */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as copyStream } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { Transform } from 'node:stream';

export const BGE_REVISION = '4de13258303883538bd53b696b452bf8099f0858';
export const BGE_FILES = [
  ['config.json', '734a79bf12d388c1467a4e3ab625f45de7f6906cffcfb93a1eca1787504bed95', 770],
  ['sentencepiece.bpe.model', 'cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865', 5069051],
  ['special_tokens_map.json', '8c785abebea9ae3257b61681b4e6fd8365ceafde980c21970d001e834cf10835', 964],
  ['tokenizer.json', '6710678b12670bc442b99edc952c4d996ae309a7020c1fa0096dd245c2faf790', 17082821],
  ['tokenizer_config.json', '7e4c1cc848840aeccdd763458c18dd525eb0f795c992e00ebe9c28554e7db2d4', 1173],
  ['onnx/model.onnx', '5d89a0010dd39aa2cfa8b22bb49f06904c5bbf5877135f877da419480f40cde3', 607298],
  ['onnx/model.onnx_data', '1eebfb28493f67bba03ce0ef64bfdc7fc5a3bd9d7493f818bb1d78cd798416b4', 2266820608],
].map(([relativePath, sha256, size]) => ({ relativePath, sha256, size, url: `https://huggingface.co/Xenova/bge-m3/resolve/${BGE_REVISION}/${relativePath}` }));
export const modelsDir = () => join(homedir(), '.openfilm', 'u3', 'models');
export const memeDoc = (meme) => `${meme.emotion}: ${meme.description ?? ''} (${meme.situations.join(', ')})`;
export const memeDocHash = (doc) => createHash('sha256').update(doc).digest('hex').slice(0, 16);
/** @param {readonly string[]} embedded @param {readonly string[]} rule */
export const mergeCandidates = (embedded, rule) => [...new Set([...embedded, ...rule])];

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Range resumes only at the requested byte. A final file appears only after size and SHA-256 verification. */
export async function downloadModelFile({ file, destination, fetcher = fetch, onProgress = () => {} }) {
  await mkdir(dirname(destination), { recursive: true });
  if (await sha256(destination).catch(() => '') === file.sha256) {
    onProgress((await stat(destination)).size);
    return;
  }
  const part = `${destination}.part`;
  let offset = await stat(part).then((s) => s.size).catch(() => 0);
  // A complete or oversized partial cannot be resumed; verify the complete one before discarding it.
  if (file.size && offset >= file.size) {
    if (offset === file.size && await sha256(part) === file.sha256) { await rename(part, destination); onProgress(offset); return; }
    await rm(part, { force: true });
    offset = 0;
  }
  const response = await fetcher(file.url, { headers: offset ? { Range: `bytes=${offset}-` } : {} });
  if (!response.ok || !response.body) throw new Error(`모델 다운로드 HTTP ${response.status}`);
  if (response.status === 206) {
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
    if (!range || Number(range[1]) !== offset || (file.size && Number(range[3]) !== file.size)) {
      await response.body.cancel();
      throw new Error('모델 이어받기 범위가 맞지 않습니다');
    }
  } else { offset = 0; }
  let received = offset;
  onProgress(received);
  const meter = new Transform({ transform(chunk, encoding, callback) {
    received += chunk.length;
    onProgress(received);
    callback(null, chunk);
  } });
  // Network failures keep .part for the next explicit download request.
  await copyStream(Readable.fromWeb(response.body), meter, createWriteStream(part, { flags: offset ? 'a' : 'w' }));
  if ((file.size && received !== file.size) || await sha256(part) !== file.sha256) {
    await rm(part, { force: true });
    throw new Error('모델 크기 또는 SHA-256 검사가 실패했습니다');
  }
  await rename(part, destination);
}

/** Download state is shared across requests. Readiness is cached only while all file sizes/times stay unchanged. */
export function modelStore({ root = modelsDir(), files = BGE_FILES, fetcher = fetch } = {}) {
  let state = 'missing';
  let error = null;
  let received = 0;
  let running = null;
  let verified = '';
  let checking = null;
  const total = files.reduce((sum, f) => sum + f.size, 0);
  const destination = (file) => join(root, 'Xenova/bge-m3', file.relativePath);
  async function ready() {
    const infos = await Promise.all(files.map((f) => stat(destination(f)).catch(() => null)));
    if (infos.some((s, i) => !s?.isFile() || s.size !== files[i].size)) return false;
    const sig = infos.map((s) => `${s.size}:${s.mtimeMs}:${s.ctimeMs}`).join('|');
    if (sig === verified) return true;
    checking ??= (async () => {
      for (const file of files) if (await sha256(destination(file)).catch(() => '') !== file.sha256) return false;
      verified = sig;
      return true;
    })().finally(() => { checking = null; });
    return checking;
  }
  return {
    root, ready,
    async status() {
      if (!running && state !== 'error') state = await ready() ? 'ready' : 'missing';
      return { state, received: state === 'ready' ? total : received, total, progress: state === 'ready' ? 1 : Math.min(1, received / total), error };
    },
    download() {
      if (running) return running;
      state = 'downloading'; error = null; received = 0; verified = '';
      running = (async () => {
        let done = 0;
        for (const file of files) {
          await downloadModelFile({ file, destination: destination(file), fetcher, onProgress: (bytes) => { received = done + bytes; } });
          done += file.size;
        }
        if (!await ready()) throw new Error('모델 SHA-256 검사가 실패했습니다');
        state = 'ready'; received = total;
      })().catch((e) => { state = 'error'; error = e.message; throw e; }).finally(() => { running = null; });
      return running;
    },
  };
}

/** Read-only index: malformed metadata, wrong model, non-finite vectors and truncated files all mean rule fallback. */
export async function readMemeIndex(dir) {
  try {
    const meta = JSON.parse(await readFile(join(dir, 'bge-m3.json'), 'utf8'));
    const bytes = await readFile(join(dir, 'bge-m3.f32'));
    if (meta.model !== 'bge-m3' || !Number.isSafeInteger(meta.dim) || meta.dim < 1 || meta.dim > 4096 || !Array.isArray(meta.items)) return null;
    if (bytes.length !== meta.items.length * meta.dim * 4) return null;
    const ids = new Set();
    for (const item of meta.items) {
      if (typeof item.id !== 'string' || ids.has(item.id) || !/^[a-f0-9]{16}$/.test(item.docHash)) return null;
      ids.add(item.id);
    }
    const matrix = new Float32Array(bytes.length / 4);
    for (let i = 0; i < matrix.length; i++) matrix[i] = bytes.readFloatLE(i * 4);
    if (!matrix.every(Number.isFinite)) return null;
    return { meta, matrix };
  } catch { return null; }
}

/** Dot product; ties keep index row order, as in u3 topBySimilarity. Changed/deleted sidecars never use stale vectors. */
export function searchMemeIndex(index, query, library, limit = 40) {
  if (query.length !== index.meta.dim || !Array.from(query).every(Number.isFinite)) throw new Error('bge-m3 query dimension mismatch');
  const current = new Map(library.map((m) => [m.id, memeDocHash(memeDoc(m))]));
  const found = [];
  index.meta.items.forEach((item, row) => {
    if (current.get(item.id) !== item.docHash) return;
    let sim = 0;
    for (let d = 0; d < index.meta.dim; d++) sim += query[d] * index.matrix[row * index.meta.dim + d];
    found.push({ id: item.id, sim: Math.fround(sim), row });
  });
  return found.sort((a, b) => b.sim - a.sim || a.row - b.row).slice(0, limit).map(({ id, sim }) => ({ id, sim }));
}

/** Resolve from the desktop's node_modules; npx's dependency tree is never involved. */
function desktopRequire(modules) {
  if (!modules) return null;
  const require = createRequire(join(modules, '..', 'package.json'));
  if (!existsSync(join(modules, '@huggingface/transformers/package.json')) || !existsSync(join(modules, 'onnxruntime-node/package.json'))) return null;
  return require;
}

export function bgeEmbedder(modules, root) {
  let loading = null;
  return {
    async embed(text) {
      loading ??= (async () => {
        const require = desktopRequire(modules);
        if (!require) throw new Error('desktop 임베딩 모듈이 없습니다');
        // Use the same CommonJS entry as the measured utilityProcess gate; it resolves exactly one pinned ONNX runtime.
        const { pipeline, env } = await import(pathToFileURL(require.resolve('@huggingface/transformers')).href);
        env.cacheDir = root;
        env.localModelPath = root;
        env.allowRemoteModels = false;
        return pipeline('feature-extraction', 'Xenova/bge-m3', { dtype: 'fp32', device: 'cpu' });
      })();
      const extractor = await loading;
      const tensor = await extractor([text], { pooling: 'cls', normalize: true });
      return tensor.data;
    },
  };
}

/** Injected embedders keep tests small. Query vectors share a bounded cache; pagination never runs the same query twice. */
export function memeSearch({ store = modelStore(), modules = process.env.OPENFILM_U3_EMBED_MODULES, embedder = null } = {}) {
  const available = Boolean(embedder || desktopRequire(modules));
  const runtime = embedder ?? bgeEmbedder(modules, store.root);
  const indexes = new Map();
  const queries = new Map();
  let chain = Promise.resolve();
  let embedError = null;
  return {
    async status() { return { ...await store.status(), available, embedError }; },
    download() {
      if (!available) throw new Error('정확한 검색은 desktop 앱에서 사용할 수 있습니다');
      return store.download();
    },
    async search(text, library, dir) {
      if (!available || !await store.ready()) return null;
      try {
        const folder = join(dir, 'meme-embed');
        const infos = await Promise.all(['bge-m3.json', 'bge-m3.f32'].map((f) => stat(join(folder, f))));
        const sig = infos.map((s) => `${s.size}:${s.mtimeMs}:${s.ctimeMs}`).join('|');
        let entry = indexes.get(folder);
        if (!entry || entry.sig !== sig) {
          entry = { sig, index: await readMemeIndex(folder) };
          indexes.set(folder, entry);
        }
        if (!entry.index) return null;
        let query = queries.get(text);
        if (!query) {
          query = chain.then(() => runtime.embed(text));
          chain = query.catch(() => {});
          queries.set(text, query);
          query.catch(() => { queries.delete(text); });
          if (queries.size > 32) queries.delete(queries.keys().next().value);
        }
        const found = searchMemeIndex(entry.index, await query, library);
        embedError = null;
        return found.length ? found : null;
      } catch (e) { embedError = e.message; return null; }
    },
  };
}

let shared;
export const memeSearchService = () => shared ??= memeSearch();
