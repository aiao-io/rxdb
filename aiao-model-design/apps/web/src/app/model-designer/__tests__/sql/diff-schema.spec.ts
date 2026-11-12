import { describe, expect, it } from 'vitest';
import { diffSqlSchema } from '../../sql/diff-schema';
import type { SqlSchema } from '../../sql/types';

const baseRemote: SqlSchema = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'text', nullable: false },
        { name: 'legacy', type: 'text', nullable: true }
      ],
      foreignKeys: [],
      indexes: [{ name: 'idx_users_legacy', columns: ['legacy'], unique: false }]
    },
    {
      name: 'old_logs',
      columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
      foreignKeys: [],
      indexes: []
    }
  ]
};

const desired: SqlSchema = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'text', nullable: true },
        { name: 'age', type: 'integer', nullable: true }
      ],
      foreignKeys: [
        {
          name: 'fk_users_org',
          column: 'org_id',
          refTable: 'orgs',
          refColumn: 'id',
          onDelete: 'SET NULL'
        }
      ],
      indexes: [{ name: 'idx_users_email', columns: ['email'], unique: true }]
    },
    {
      name: 'posts',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'title', type: 'text', nullable: false }
      ],
      foreignKeys: [],
      indexes: []
    }
  ]
};

describe('diffSqlSchema', () => {
  it('emits DROP TABLE / CREATE / ADD / DROP COLUMN / nullability / indexes / FK', () => {
    const result = diffSqlSchema(desired, baseRemote);
    expect(result.sql).toContain('DROP TABLE old_logs;');
    expect(result.sql).toContain('CREATE TABLE posts');
    expect(result.sql).toContain('ALTER TABLE users DROP COLUMN legacy;');
    expect(result.sql).toContain('ALTER TABLE users ADD COLUMN age integer;');
    expect(result.sql).toContain('ALTER TABLE users ALTER COLUMN email DROP NOT NULL;');
    expect(result.sql).toContain('DROP INDEX idx_users_legacy;');
    expect(result.sql).toContain('CREATE UNIQUE INDEX idx_users_email ON users (email);');
    expect(result.sql).toContain(
      'ALTER TABLE users ADD CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES orgs (id) ON DELETE SET NULL;'
    );
  });

  it('omits unchanged tables from output body', () => {
    const same: SqlSchema = {
      tables: [
        {
          name: 'stable',
          columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
          foreignKeys: [],
          indexes: []
        }
      ]
    };
    const result = diffSqlSchema(same, same);
    expect(result.sql).toBe('');
  });

  it('TYPE change uses ALTER COLUMN TYPE', () => {
    const remote: SqlSchema = {
      tables: [
        {
          name: 't',
          columns: [{ name: 'n', type: 'integer', nullable: true }],
          foreignKeys: [],
          indexes: []
        }
      ]
    };
    const next: SqlSchema = {
      tables: [
        {
          name: 't',
          columns: [{ name: 'n', type: 'double precision', nullable: true }],
          foreignKeys: [],
          indexes: []
        }
      ]
    };
    const result = diffSqlSchema(next, remote);
    expect(result.sql).toContain('ALTER TABLE t ALTER COLUMN n TYPE double precision;');
  });
});
