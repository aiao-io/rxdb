import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

const workspace = resolve(import.meta.dirname, '../../..');
const supervisor = resolve(import.meta.dirname, 'supervise.mjs');
const longRunning = [
  ['aiao-media/apps/web/project.json', 'dev'],
  ['aiao-media/apps/web/project.json', 'supabase-dev'],
  ['aiao-media/apps/api/project.json', 'dev']
];

function unsupervised(projects) {
  return longRunning
    .filter(([file, name]) => {
      const { cwd, command } = projects[file].targets[name].options;
      return resolve(workspace, cwd, command.split(' ')[1]) !== supervisor;
    })
    .map(([file, name]) => `${file}:${name}`);
}

test('every long-running command of the dev chain is started through the supervisor', async () => {
  const projects = {};
  for (const [file] of longRunning) projects[file] = JSON.parse(await readFile(resolve(workspace, file), 'utf8'));
  assert.deepEqual(unsupervised(projects), []);
});

test('a long-running command that bypasses the supervisor is reported', () => {
  const target = (cwd, command) => ({
    targets: { dev: { options: { cwd, command } }, 'supabase-dev': { options: { cwd, command } } }
  });
  const projects = {
    'aiao-media/apps/web/project.json': target(
      'aiao-media',
      'node scripts/dev/supervise.mjs node scripts/dev/open-dashboard.mjs'
    ),
    'aiao-media/apps/api/project.json': target('aiao-media/apps/api', 'pnpm exec wrangler dev --port 8787')
  };
  assert.deepEqual(unsupervised(projects), ['aiao-media/apps/api/project.json:dev']);
});
