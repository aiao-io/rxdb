import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createApprovedCatalogArtifact } from './approved-catalog.mjs';

test('目录夹具只改产物副本的批准配置并保留指定历史摘要；无匹配配置直接失败', async () => {
  const source = await mkdtemp(join(tmpdir(), 'aiao-catalog-source-'));
  const contents = '{"formatVersion":1,"releases":[]}\n';
  const digest = createHash('sha256').update(contents).digest('hex');
  try {
    await writeFile(join(source, 'approved-apps.json'), contents);
    const script = `const config={sha256:"${digest}",trustedDigests:["${digest}"]};`;
    await writeFile(join(source, 'main.js'), script);
    const artifact = await createApprovedCatalogArtifact({
      source,
      releases: [{ id: 'fixture' }],
      trustedDigests: [digest]
    });
    try {
      const patched = await readFile(join(artifact.root, 'main.js'), 'utf8');
      assert.ok(patched.includes(`trustedDigests:["${artifact.sha256}","${digest}"]`));
      assert.equal(await readFile(join(source, 'main.js'), 'utf8'), script);
      assert.equal(await readFile(join(artifact.root, 'approved-apps.json'), 'utf8'), artifact.contents);
    } finally {
      await artifact.dispose();
    }
    await writeFile(join(source, 'main.js'), 'const noConfiguration = true;');
    await assert.rejects(createApprovedCatalogArtifact({ source, releases: [] }), /Expected one compiled/);
  } finally {
    await rm(source, { recursive: true, force: true });
  }
});
