import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { migrationsRoot, productRoot } from './lib/paths.mjs';

/**
 * 迁移的回滚说明门禁（ADMIN-US-217 AC#8）：`supabase/migrations/` 里的每个迁移都必须在 `deploy/migrations.json` 登记
 * 能否回滚、对数据的影响、回滚办法与前向修复办法，且不多不少、顺序一致。新增迁移不补说明，产品根的 test 就不通过。
 */
const fields = ['name', 'summary', 'reversible', 'previousRelease', 'dataImpact', 'rollback', 'forwardFix'];

describe('迁移的回滚说明', () => {
  it('每个迁移文件都有完整的说明，与目录里的文件一一对应', async () => {
    const files = (await readdir(migrationsRoot)).filter(name => name.endsWith('.sql')).sort();
    const { migrations } = JSON.parse(await readFile(path.join(productRoot, 'deploy', 'migrations.json'), 'utf8'));
    assert.deepEqual(
      migrations.map(note => note.name),
      files
    );
    for (const note of migrations) {
      assert.deepEqual(Object.keys(note), fields, note.name);
      assert.equal(typeof note.reversible, 'boolean', note.name);
      for (const field of fields.filter(name => name !== 'reversible'))
        assert.ok(typeof note[field] === 'string' && note[field].trim().length > 0, `${note.name} 缺少 ${field}`);
    }
  });
});
