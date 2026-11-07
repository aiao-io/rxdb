// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgSchemaReader } from '../../src/routes/model-designer/schema-reader';
const postgresModule = vi.hoisted(() => ({ postgres: vi.fn() }));
vi.mock('postgres', () => ({ default: postgresModule.postgres }));
interface SqlStub {
  (strings: TemplateStringsArray): unknown;
  end: ReturnType<typeof vi.fn>;
}
function makeSqlStub(results: Readonly<Record<string, unknown>>): SqlStub {
  const query = vi.fn((strings: TemplateStringsArray) => {
    const statement = strings.join(' ');
    const entry = Object.entries(results).find(([fragment]) => statement.includes(fragment));
    if (!entry) throw new Error(`Unexpected schema query: ${statement}`);
    if (entry[1] instanceof Error) throw entry[1];
    return entry[1];
  }) as unknown as SqlStub;
  query.end = vi.fn().mockResolvedValue(undefined);
  return query;
}
beforeEach(() => vi.clearAllMocks());
describe('createPgSchemaReader', () => {
  it.each([undefined, '', '   '])('returns null when DATABASE_URL is %s', databaseUrl => {
    expect(createPgSchemaReader(databaseUrl)).toBeNull();
    expect(postgresModule.postgres).not.toHaveBeenCalled();
  });
  it('maps information_schema rows into a complete remote schema', async () => {
    const sql = makeSqlStub({
      'FROM information_schema.tables': [{ table_name: 'accounts' }, { table_name: 'events' }, { table_name: 'empty' }],
      'FROM information_schema.columns': [
        {
          table_name: 'accounts',
          column_name: 'id',
          data_type: 'USER-DEFINED',
          udt_name: 'uuid',
          is_nullable: 'NO',
          column_default: 'gen_random_uuid()'
        },
        {
          table_name: 'accounts',
          column_name: 'email',
          data_type: 'character varying',
          udt_name: 'varchar',
          is_nullable: 'NO',
          column_default: null
        },
        {
          table_name: 'accounts',
          column_name: 'roles',
          data_type: 'ARRAY',
          udt_name: '_text',
          is_nullable: 'YES',
          column_default: null
        },
        {
          table_name: 'events',
          column_name: 'small_count',
          data_type: 'integer',
          udt_name: 'int4',
          is_nullable: 'NO',
          column_default: '0'
        },
        {
          table_name: 'events',
          column_name: 'big_count',
          data_type: 'bigint',
          udt_name: 'int8',
          is_nullable: 'NO',
          column_default: null
        },
        {
          table_name: 'events',
          column_name: 'score',
          data_type: 'double precision',
          udt_name: 'float8',
          is_nullable: 'YES',
          column_default: null
        },
        {
          table_name: 'events',
          column_name: 'enabled',
          data_type: 'boolean',
          udt_name: 'bool',
          is_nullable: 'NO',
          column_default: 'true'
        },
        {
          table_name: 'events',
          column_name: 'payload',
          data_type: 'jsonb',
          udt_name: 'jsonb',
          is_nullable: 'YES',
          column_default: null
        },
        {
          table_name: 'events',
          column_name: 'created_at',
          data_type: 'timestamp with time zone',
          udt_name: 'timestamptz',
          is_nullable: 'NO',
          column_default: 'now()'
        },
        {
          table_name: 'events',
          column_name: 'label',
          data_type: 'text',
          udt_name: 'text',
          is_nullable: 'YES',
          column_default: null
        },
        {
          table_name: 'events',
          column_name: 'fallback_timestamp',
          data_type: 'timestamp with time zone',
          udt_name: 'custom_timestamp',
          is_nullable: 'YES',
          column_default: null
        }
      ],
      "constraint_type = 'PRIMARY KEY'": [
        { table_name: 'accounts', column_name: 'id' },
        { table_name: 'events', column_name: 'small_count' }
      ],
      "constraint_type = 'UNIQUE'": [
        { table_name: 'accounts', column_name: 'id' },
        { table_name: 'accounts', column_name: 'email' }
      ],
      "constraint_type = 'FOREIGN KEY'": [
        {
          constraint_name: 'events_account_id_fkey',
          table_name: 'events',
          column_name: 'account_id',
          foreign_table_name: 'accounts',
          foreign_column_name: 'id',
          delete_rule: 'CASCADE',
          update_rule: 'NO ACTION'
        },
        {
          constraint_name: 'events_parent_id_fkey',
          table_name: 'events',
          column_name: 'parent_id',
          foreign_table_name: 'events',
          foreign_column_name: 'small_count',
          delete_rule: null,
          update_rule: 'SET NULL'
        }
      ],
      'FROM pg_indexes': [
        { tablename: 'accounts', indexname: 'accounts_pkey', indexdef: 'CREATE UNIQUE INDEX accounts_pkey' },
        { tablename: 'accounts', indexname: 'idx_invalid', indexdef: 'CREATE INDEX idx_invalid ON accounts' },
        {
          tablename: 'accounts',
          indexname: 'idx_accounts_email',
          indexdef: 'CREATE UNIQUE INDEX idx_accounts_email ON accounts ("email")'
        },
        {
          tablename: 'events',
          indexname: 'idx_events_score_label',
          indexdef: 'CREATE INDEX idx_events_score_label ON events (score DESC, "label")'
        }
      ]
    });
    postgresModule.postgres.mockReturnValue(sql);
    const reader = createPgSchemaReader('postgresql://db.test/app');
    await expect(reader?.()).resolves.toEqual({
      tables: [
        {
          name: 'accounts',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              nullable: false,
              primaryKey: true,
              unique: false,
              defaultValue: 'gen_random_uuid()'
            },
            {
              name: 'email',
              type: 'character varying',
              nullable: false,
              primaryKey: false,
              unique: true,
              defaultValue: null
            },
            {
              name: 'roles',
              type: 'text[]',
              nullable: true,
              primaryKey: false,
              unique: false,
              defaultValue: null
            }
          ],
          foreignKeys: [],
          indexes: [{ name: 'idx_accounts_email', columns: ['email'], unique: true }]
        },
        {
          name: 'events',
          columns: [
            {
              name: 'small_count',
              type: 'integer',
              nullable: false,
              primaryKey: true,
              unique: false,
              defaultValue: '0'
            },
            {
              name: 'big_count',
              type: 'bigint',
              nullable: false,
              primaryKey: false,
              unique: false,
              defaultValue: null
            },
            {
              name: 'score',
              type: 'double precision',
              nullable: true,
              primaryKey: false,
              unique: false,
              defaultValue: null
            },
            {
              name: 'enabled',
              type: 'boolean',
              nullable: false,
              primaryKey: false,
              unique: false,
              defaultValue: 'true'
            },
            {
              name: 'payload',
              type: 'jsonb',
              nullable: true,
              primaryKey: false,
              unique: false,
              defaultValue: null
            },
            {
              name: 'created_at',
              type: 'timestamptz',
              nullable: false,
              primaryKey: false,
              unique: false,
              defaultValue: 'now()'
            },
            {
              name: 'label',
              type: 'text',
              nullable: true,
              primaryKey: false,
              unique: false,
              defaultValue: null
            },
            {
              name: 'fallback_timestamp',
              type: 'timestamptz',
              nullable: true,
              primaryKey: false,
              unique: false,
              defaultValue: null
            }
          ],
          foreignKeys: [
            {
              name: 'events_account_id_fkey',
              column: 'account_id',
              refTable: 'accounts',
              refColumn: 'id',
              onDelete: 'CASCADE',
              onUpdate: null
            },
            {
              name: 'events_parent_id_fkey',
              column: 'parent_id',
              refTable: 'events',
              refColumn: 'small_count',
              onDelete: null,
              onUpdate: 'SET NULL'
            }
          ],
          indexes: [{ name: 'idx_events_score_label', columns: ['score', 'label'], unique: false }]
        },
        { name: 'empty', columns: [], foreignKeys: [], indexes: [] }
      ]
    });
    expect(postgresModule.postgres).toHaveBeenCalledWith('postgresql://db.test/app', { prepare: false, max: 1 });
    expect(sql).toHaveBeenCalledTimes(6);
    expect(sql.end).toHaveBeenCalledWith({ timeout: 1 });
  });
  it('closes the connection when a schema query fails', async () => {
    const sql = makeSqlStub({ 'FROM information_schema.tables': new Error('schema unavailable') });
    postgresModule.postgres.mockReturnValue(sql);
    const reader = createPgSchemaReader('postgresql://db.test/app');
    await expect(reader?.()).rejects.toThrow('schema unavailable');
    expect(sql.end).toHaveBeenCalledWith({ timeout: 1 });
  });
});
