import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./package-api-docs.mjs', import.meta.url));
const fixtureRoot = fileURLToPath(new URL('./__fixtures__/package-api-docs/', import.meta.url));

const runAudit = (fixture, ...args) =>
  spawnSync(process.execPath, [script, `${fixtureRoot}${fixture}`, ...args], {
    encoding: 'utf8'
  });

test('member audit accepts documented public members and ignores private or inherited external members', () => {
  const result = runAudit('pass', '--members');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Public API documentation passed: pass/);
});

test('member audit exits non-zero and prints complete paths for missing member documentation', () => {
  const result = runAudit('fail-missing-member', '--members');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /BrokenService\.missing/);
  assert.match(result.stderr, /BrokenSettings\.missing/);
  assert.match(result.stderr, /BrokenSettings\.nested\.undocumentedNested/);
  assert.doesNotMatch(result.stderr, /privateMissing|protectedMissing|undocumentedExternal/);
});

test('root-only mode remains compatible with existing package build callers', () => {
  const result = runAudit('fail-missing-member');

  assert.equal(result.status, 0, result.stderr);
});
