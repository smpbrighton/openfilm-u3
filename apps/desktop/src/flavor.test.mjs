import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { FLAVORS, flavorName } from './flavor.mjs';

test('u3 Studio names and bundle IDs identify release, preview, dev and bench separately', () => {
  for (const [name, suffix] of [['release', ''], ['preview', ' Preview'], ['dev', ' Dev']]) {
    assert.equal(FLAVORS[name].productName, `u3 Studio${suffix}`);
    assert.equal(FLAVORS[name].bundleId, `ai.brightongroup.u3studio${name === 'release' ? '' : `.${name}`}`);
  }
  const bench = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    `import { IDENTITY } from ${JSON.stringify(new URL('./flavor.mjs', import.meta.url).href)}; console.log(JSON.stringify(IDENTITY));`,
  ], { encoding: 'utf8', env: { ...process.env, OPENFILM_DESKTOP_FLAVOR: 'bench', OPENFILM_BENCH_DIR: '/tmp/u3-bench' } }));
  assert.equal(bench.productName, 'u3 Studio Bench');
  assert.equal(bench.bundleId, 'ai.brightongroup.u3studio.bench');
  assert.equal(bench.userData, '/tmp/u3-bench/data');
});

test('which app this is: packaged, the release unless built as the preview; from source, dev when asked', () => {
  assert.equal(flavorName({}, true, null), 'release');
  assert.equal(flavorName({}, true, 'preview'), 'preview');
  assert.equal(flavorName({ OPENFILM_DESKTOP_FLAVOR: 'dev' }, true, null), 'release', 'a packaged app is never dev');
  assert.equal(flavorName({ OPENFILM_DESKTOP_FLAVOR: 'dev' }, false), 'dev');
  assert.equal(flavorName({}, false), 'release');
});

test('the preview shares nothing with an installed OpenFilm or the dev app', () => {
  const { release, preview, dev } = FLAVORS;
  for (const other of [release, dev]) {
    assert.notEqual(preview.productName, other.productName);
    assert.notEqual(preview.bundleId, other.bundleId);
    assert.notEqual(preview.studioPort, other.studioPort);
    assert.notEqual(preview.studioHome, other.studioHome);
  }
  assert.ok(preview.studioHome, 'its own Studio home, not the machine\'s ~/.openfilm');
});

test('every app makes its projects in the person\'s one library', () => {
  for (const flavor of Object.values(FLAVORS)) {
    assert.equal(flavor.library, null);
    /* the folder the person chose for it is kept in the machine's Studio home */
    assert.equal(flavor.sharedHome ?? join(homedir(), '.openfilm'), join(homedir(), '.openfilm'));
  }
});
