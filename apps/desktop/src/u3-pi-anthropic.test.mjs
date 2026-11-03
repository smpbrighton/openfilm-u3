import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { agentSessionsDir } from './chat-store.mjs';
import { KEEP_PICTURE_RESULTS, providerOf } from './pi-config.mjs';

const MODEL = 'claude-opus-5-5';
const BINDING_BETA = 'thinking-binding-controls-2026-08-01';
const own = (over = {}) => ({ id: 'claude', name: 'My Claude', api: 'anthropic-messages', keyEnv: 'U3_TEST_MODEL_KEY',
  model: MODEL, levels: ['auto', 'low', 'high'], effort: 'auto', context: 256_000, ...over });

/** Capture the real adapter's HTTP requests; no request reaches a paid model service. */
async function adapter(t, models = [own()]) {
  const cwd = mkdtempSync(join(tmpdir(), 'u3-pi-anthropic-'));
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ path: req.url, headers: req.headers, body });
    const blocks = body.messages.flatMap((m) => Array.isArray(m.content) ? m.content : []);
    if (blocks.some((b) => b.type === 'thinking') &&
        (!req.headers['anthropic-beta']?.split(',').includes(BINDING_BETA) ||
          body.thinking?.block_binding?.prefix_mismatch_behavior !== 'drop_block')) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error',
        message: 'Invalid `signature` in `thinking` block. The block is bound to a different conversation.' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (req.url.includes('/chat/completions')) {
      res.end(`data: ${JSON.stringify({ id: 'local-chat', model: body.model, choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: null }] })}\n\n` +
        `data: ${JSON.stringify({ id: 'local-chat', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1 } })}\n\ndata: [DONE]\n\n`);
      return;
    }
    const events = [
      { type: 'message_start', message: { id: 'local-message', type: 'message', role: 'assistant', model: body.model,
        content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ];
    res.end(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const child = spawn(process.execPath, [new URL('./pi-agent.mjs', import.meta.url).pathname], {
    cwd,
    env: { ...process.env, U3_TEST_MODEL_KEY: 'local-test-key', OPENFILM_PI: JSON.stringify({
      agentDir: join(cwd, 'agent-config'), models: models.map((m) => ({ ...m, baseUrl })), model: models[0].id,
      systemPrompt: 'Reply briefly. These are local protocol tests.', skills: { names: [], paths: [] },
    }) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(async () => {
    const exited = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : once(child, 'exit');
    child.kill();
    await exited;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  });
  const client = new acp.ClientSideConnection(() => ({
    sessionUpdate: async () => {},
    requestPermission: async () => ({ outcome: { outcome: 'cancelled' } }),
  }), acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));
  await client.initialize({ protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} }).catch((error) => {
    throw new Error(`${error.message}\n${stderr}`);
  });
  return { cwd, baseUrl, client, requests };
}

const prompt = (client, sessionId) => client.prompt({ sessionId, prompt: [{ type: 'text', text: 'Continue.' }] });
function binding(request) {
  assert.equal(request.body.thinking?.type, 'adaptive');
  assert.equal(request.body.thinking?.block_binding?.prefix_mismatch_behavior, 'drop_block');
  assert.ok(request.headers['anthropic-beta']?.split(',').includes(BINDING_BETA));
}

test('BYOK Claude Auto and explicit efforts send the SDK thinking binding controls', { timeout: 30_000 }, async (t) => {
  const { client, cwd, requests, baseUrl } = await adapter(t);
  const session = await client.newSession({ cwd, mcpServers: [] });
  assert.equal(session.configOptions.find((o) => o.id === 'effort').currentValue, 'auto');
  assert.equal((await prompt(client, session.sessionId)).stopReason, 'end_turn');
  binding(requests.at(-1));
  assert.equal(requests.at(-1).path, '/v1/messages');
  assert.equal(requests.at(-1).headers['x-api-key'], 'local-test-key');
  assert.equal(requests.at(-1).body.model, MODEL);
  assert.equal(requests.at(-1).body.max_tokens, 32_000);
  for (const effort of ['low', 'high', 'auto']) {
    const changed = await client.setSessionConfigOption({ sessionId: session.sessionId, configId: 'effort', value: effort });
    assert.equal(changed.configOptions.find((o) => o.id === 'effort').currentValue, effort);
    assert.equal((await prompt(client, session.sessionId)).stopReason, 'end_turn');
    binding(requests.at(-1));
    if (effort !== 'auto') {
      const levels = [requests.at(-1).body.output_config?.effort,
        ...requests.at(-1).body.messages.flatMap((m) => m.output_config ? [m.output_config.effort] : [])];
      assert.equal(levels.at(-1), effort, 'the requested effort reaches the model');
    }
  }
  const kept = JSON.parse(readFileSync(join(cwd, 'agent-config/models.json'), 'utf8'));
  assert.equal(kept.providers[providerOf('claude')].baseUrl, baseUrl);
  assert.equal(kept.providers[providerOf('claude')].apiKey, '$U3_TEST_MODEL_KEY');
  assert.equal(kept.providers[providerOf('claude')].models[0].contextWindow, 256_000);
  assert.equal(kept.providers[providerOf('claude')].models[0].name, 'My Claude');
});

test('resuming signed Claude history keeps reasoning and tools while old pictures are omitted', { timeout: 30_000 }, async (t) => {
  const { client, cwd, requests } = await adapter(t);
  const history = SessionManager.create(cwd, agentSessionsDir(cwd));
  history.appendModelChange(providerOf('claude'), MODEL);
  history.appendThinkingLevelChange('off');
  history.appendMessage({ role: 'user', content: 'Inspect these pictures.', timestamp: 0 });
  const usage = { input: 10, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 11,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  for (let i = 0; i <= KEEP_PICTURE_RESULTS; i++) {
    history.appendMessage({ role: 'assistant', api: 'anthropic-messages', provider: providerOf('claude'), model: MODEL,
      timestamp: i + 1, stopReason: 'toolUse', usage, content: [
        { type: 'thinking', thinking: `Inspect picture ${i}.`, thinkingSignature: `local-signature-${i}` },
        { type: 'toolCall', id: `read_${i}`, name: 'read', arguments: { path: `picture-${i}.png` } },
      ] });
    history.appendMessage({ role: 'toolResult', toolCallId: `read_${i}`, toolName: 'read', timestamp: i + 1,
      content: [{ type: 'text', text: 'Read image file [image/png]' }, { type: 'image', mimeType: 'image/png', data: 'cGljdHVyZQ==' }],
      isError: false });
  }
  const sessionId = history.getSessionId();
  await client.resumeSession({ cwd, sessionId, mcpServers: [] });
  assert.equal((await prompt(client, sessionId)).stopReason, 'end_turn');
  binding(requests.at(-1));
  const blocks = requests.at(-1).body.messages.flatMap((m) => Array.isArray(m.content) ? m.content : []);
  const thinking = blocks.filter((b) => b.type === 'thinking');
  assert.equal(thinking.length, KEEP_PICTURE_RESULTS + 1, 'valid reasoning is not stripped by the client');
  assert.equal(thinking[0].signature, 'local-signature-0');
  const results = blocks.filter((b) => b.type === 'tool_result');
  assert.equal(results.length, KEEP_PICTURE_RESULTS + 1);
  assert.match(results[0].content[1].text, /picture-0.png.*left out/);
  assert.equal(results.flatMap((b) => b.content).filter((b) => b.type === 'image').length, KEEP_PICTURE_RESULTS);
  assert.ok(history.buildSessionProjection().messages.some((m) => m.role === 'toolResult' && m.content.some((b) => b.type === 'image')),
    'the saved conversation retains its original images');
});

test('unknown Anthropic models and other APIs keep their own request settings', { timeout: 30_000 }, async (t) => {
  const models = [own({ id: 'unknown', model: 'private-model-alias', levels: ['auto'] }),
    own({ id: 'other-api', api: 'openai-completions', levels: ['auto'] })];
  const { client, cwd, requests } = await adapter(t, models);
  const { sessionId } = await client.newSession({ cwd, mcpServers: [] });
  assert.equal((await prompt(client, sessionId)).stopReason, 'end_turn');
  assert.equal(requests.at(-1).body.thinking, undefined);
  assert.ok(!requests.at(-1).headers['anthropic-beta']?.includes(BINDING_BETA));
  await client.setSessionConfigOption({ sessionId, configId: 'model', value: 'other-api' });
  assert.equal((await prompt(client, sessionId)).stopReason, 'end_turn');
  assert.equal(requests.at(-1).path, '/v1/chat/completions');
  assert.equal(requests.at(-1).body.model, MODEL);
  assert.equal(requests.at(-1).body.thinking, undefined);
  assert.equal(requests.at(-1).headers['anthropic-beta'], undefined);
});
