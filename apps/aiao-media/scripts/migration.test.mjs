import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { auditRequirements } from './check-requirements.mjs';

const application = resolve(import.meta.dirname, '..');
const repository = resolve(application, '../..');
const manifest = JSON.parse(await readFile(resolve(application, 'requirements/plans/source-import.json'), 'utf8'));

test('all imported binary design and product resources retain their original bytes', async () => {
  const resources = manifest.files.filter(file => /\.(png|webp|jpg|ico)$/.test(file.source));
  assert.ok(resources.length > 20);
  for (const file of resources) {
    const bytes = await readFile(resolve(repository, file.destination));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.source);
  }
});

test('all original application stories retain their independent identity and status', async () => {
  const report = await auditRequirements(application, { namespace: 'MEDIA', repositoryRoot: repository });
  assert.deepEqual(report.errors, []);
  assert.equal(report.total, manifest.stories.length);
  const { glob } = await import('node:fs/promises');
  const stories = [];
  for await (const path of glob('requirements/stories/*/MEDIA-US-*.md', { cwd: application })) {
    const text = await readFile(resolve(application, path), 'utf8');
    stories.push(parse(text.match(/^---\n([\s\S]*?)\n---/)[1]));
  }
  for (const original of manifest.stories) {
    const current = stories.find(story => story.legacyId === original.legacyId);
    assert.ok(current, original.legacyId);
    assert.equal(current.status, original.status);
  }
});

test('private data and contracts remain ordinary folders owned by the application', async () => {
  for (const directory of ['src/contracts', 'src/local-data', 'infra/supabase']) {
    assert.ok((await stat(resolve(application, directory))).isDirectory());
    for (const config of ['project.json', 'package.json']) {
      await assert.rejects(stat(resolve(application, directory, config)), { code: 'ENOENT' });
    }
  }
});
