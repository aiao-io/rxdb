import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { migrationsRoot, productRoot } from './lib/paths.mjs';
import { migrationNotes } from './lib/stack.mjs';

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

describe('回滚时列出比目标发布新的迁移', () => {
  it('目标发布没有的迁移与同名但内容不同的迁移都列出（附回滚说明），两边相同的不列', async () => {
    const current = {
      migrations: [
        { name: '202611180001_service_role.sql', sha256: 'a' },
        { name: '202611180002_exchange_commits.sql', sha256: 'b-new' },
        { name: '202611180003_audit_archive.sql', sha256: 'c' }
      ]
    };
    const target = {
      migrations: [
        { name: '202611180001_service_role.sql', sha256: 'a' },
        { name: '202611180002_exchange_commits.sql', sha256: 'b-old' }
      ]
    };
    const notes = await migrationNotes(current, target);
    assert.deepEqual(
      notes.map(note => [note.name, note.change, note.reversible]),
      [
        ['202611180002_exchange_commits.sql', 'changed', false],
        ['202611180003_audit_archive.sql', 'added', true]
      ]
    );
    assert.ok(notes.every(note => note.rollback && note.forwardFix));
    assert.deepEqual(await migrationNotes(current, current), []);
  });
});
