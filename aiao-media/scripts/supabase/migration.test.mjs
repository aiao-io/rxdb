import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { auditRequirements } from '../check-requirements.mjs';

const application = resolve(import.meta.dirname, '../..');
const webRoot = resolve(application, 'apps/web');
const repository = resolve(application, '..');
const manifest = JSON.parse(await readFile(resolve(application, 'requirements/plans/source-import.json'), 'utf8'));

test('all imported binary design and product resources retain their original bytes', async () => {
  const resources = manifest.files.filter(file => /\.(png|webp|jpg|ico)$/.test(file.source));
  assert.ok(resources.length > 20);
  for (const file of resources) {
    const bytes = await readFile(resolve(repository, file.destination));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.source);
  }
});

test('all original application stories retain their independent identity and allow audited progress', async () => {
  const report = await auditRequirements(application, { namespace: 'MEDIA', repositoryRoot: repository });
  assert.deepEqual(report.errors, []);
  const { glob } = await import('node:fs/promises');
  const stories = [];
  for await (const path of glob('requirements/stories/*/MEDIA-US-*.md', { cwd: application })) {
    const text = await readFile(resolve(application, path), 'utf8');
    stories.push(parse(text.match(/^---\n([\s\S]*?)\n---/)[1]));
  }
  assert.equal(report.total, stories.length);
  const importedIds = new Set(manifest.stories.map(original => `MEDIA-${original.legacyId.split(':')[1]}`));
  for (const original of manifest.stories) {
    const current = stories.find(story => story.legacyId === original.legacyId);
    const retired = manifest.retiredStories.find(story => story.legacyId === original.legacyId);
    if (retired) {
      assert.equal(current, undefined);
      const decisions = await readFile(resolve(application, 'requirements/decisions.md'), 'utf8');
      assert.match(decisions, new RegExp(`### ${retired.decision}：`));
      assert.ok(retired.reason.trim());
      continue;
    }
    assert.ok(current, original.legacyId);
    assert.equal(current.id, `MEDIA-${original.legacyId.split(':')[1]}`);
    assert.ok(['Done', 'In Progress', 'In Review', 'Backlog', 'Blocked'].includes(current.status));
    assert.ok(stories.filter(story => story.legacyId === original.legacyId).length === 1);
  }
  for (const current of stories.filter(story => !importedIds.has(story.id))) {
    assert.equal(current.product, 'aiao-media');
    assert.equal(current.legacyId, undefined);
  }
});

test('private data remains app-owned while shared contracts are package-owned', async () => {
  assert.ok((await stat(resolve(webRoot, 'src/local-data'))).isDirectory());
  assert.ok((await stat(resolve(application, 'infra/supabase'))).isDirectory());
  for (const directory of [resolve(webRoot, 'src/local-data'), resolve(application, 'infra/supabase')])
    for (const config of ['project.json', 'package.json'])
      await assert.rejects(stat(resolve(directory, config)), { code: 'ENOENT' });
  await assert.rejects(stat(resolve(webRoot, 'src/contracts')), { code: 'ENOENT' });
  assert.ok((await stat(resolve(repository, 'aiao-media/packages/api-contracts/package.json'))).isFile());
});
