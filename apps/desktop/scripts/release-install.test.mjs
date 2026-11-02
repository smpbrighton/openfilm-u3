import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

test('the release npm command installs a required Windows native package on the build host', async t => {
  const root = await mkdtemp(join(tmpdir(), 'u3-release-install-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const native = join(root, 'native');
  await mkdir(native);
  await writeFile(join(native, 'package.json'), JSON.stringify({
    name: 'u3-native-fixture', version: '1.0.0', os: ['win32'], cpu: ['x64'],
  }));
  const tarball = execFileSync('npm', ['pack', '--ignore-scripts', '--silent'], { cwd: native, encoding: 'utf8' }).trim();
  const stage = join(root, 'app');
  await mkdir(stage);
  await writeFile(join(stage, 'package.json'), JSON.stringify({
    name: 'u3-stage-fixture', version: '1.0.0', private: true,
    dependencies: { 'u3-native-fixture': `file:../native/${tarball}` },
  }));
  // Exercise the actual install arguments without downloading or packaging the app.
  const source = await readFile(new URL('./release.mjs', import.meta.url), 'utf8');
  const command = /run\('npm', (\[[^\n]+\]), \{ cwd: stage \}\);/.exec(source);
  assert.ok(command, 'release npm install command is present');
  const args = runInNewContext(command[1], { win: true, arch: 'x64', process });
  execFileSync('npm', args, { cwd: stage, stdio: 'pipe' });
  const installed = JSON.parse(await readFile(join(stage, 'node_modules/u3-native-fixture/package.json'), 'utf8'));
  assert.equal(installed.version, '1.0.0');
});
