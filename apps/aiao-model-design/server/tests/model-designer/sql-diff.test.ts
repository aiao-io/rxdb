// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  diffSqlSchema,
  type SqlColumn,
  type SqlForeignKey,
  type SqlIndex,
  type SqlSchema,
  type SqlTable
} from '../../src/routes/model-designer/sql-diff';

/**
 * `sql-diff.ts` 此前 **42.52% 语句 / 45 个未覆盖分支**，是 apps/api 单文件最大的缺口
 * （specs/027 T148）。它的文件头自陈是 `packages/rxdb-model-designer/src/sql/diff-schema`
 * 的「纯函数副本，避免 api 依赖 Angular 包」——**「规则对齐」这句没有任何东西在验**，
 * 副本自己也没有测试。两件事里先解决后一件。
 *
 * 断言全部对着**生成的 SQL 文本**，因为那就是这个函数的全部产出：
 * 它没有中间状态可查，说「行为正确」只能说「吐出的语句正确」。
 */

const col = (name: string, overrides: Partial<SqlColumn> = {}): SqlColumn => ({
  name,
  type: 'text',
  nullable: true,
  ...overrides
});

const table = (name: string, overrides: Partial<SqlTable> = {}): SqlTable => ({
  name,
  columns: [],
  foreignKeys: [],
  indexes: [],
  ...overrides
});

const schema = (...tables: SqlTable[]): SqlSchema => ({ tables });

const EMPTY: SqlSchema = schema();

const fk = (name: string, overrides: Partial<SqlForeignKey> = {}): SqlForeignKey => ({
  name,
  column: 'owner_id',
  refTable: 'users',
  refColumn: 'id',
  ...overrides
});

const idx = (name: string, overrides: Partial<SqlIndex> = {}): SqlIndex => ({
  name,
  columns: ['email'],
  unique: false,
  ...overrides
});

describe('diffSqlSchema — 标识符引用', () => {
  it('合法小写标识符不加引号', () => {
    const sql = diffSqlSchema(schema(table('users', { columns: [col('id')] })), EMPTY);

    expect(sql).toContain('CREATE TABLE users (');
    expect(sql).toContain('  id text');
  });

  it.each([
    ['Users', '"Users"'],
    ['user-id', '"user-id"'],
    ['1st_table', '"1st_table"'],
    ['select', 'select']
  ])('%s 需要引用时加引号', (name, expected) => {
    const sql = diffSqlSchema(EMPTY, schema(table(name)));

    expect(sql).toBe(`DROP TABLE ${expected};`);
  });

  it('标识符内的双引号被转义为两个', () => {
    expect(diffSqlSchema(EMPTY, schema(table('we"ird')))).toBe('DROP TABLE "we""ird";');
  });
});

describe('diffSqlSchema — 建表', () => {
  it('主键列不再补 NOT NULL / UNIQUE（已被 PRIMARY KEY 蕴含）', () => {
    const sql = diffSqlSchema(
      schema(table('users', { columns: [col('id', { nullable: false, primaryKey: true, unique: true })] })),
      EMPTY
    );

    expect(sql).toContain('  id text PRIMARY KEY');
    expect(sql).not.toContain('NOT NULL');
    expect(sql).not.toContain('UNIQUE');
  });

  it('非主键列按 nullable / unique 补修饰', () => {
    const sql = diffSqlSchema(
      schema(
        table('users', {
          columns: [col('email', { nullable: false, unique: true }), col('bio')]
        })
      ),
      EMPTY
    );

    expect(sql).toContain('  email text NOT NULL UNIQUE');
    expect(sql).toContain('  bio text');
  });

  it('外键的 ON DELETE / ON UPDATE 各自可选', () => {
    const sql = diffSqlSchema(
      schema(
        table('posts', {
          columns: [col('owner_id')],
          foreignKeys: [
            fk('fk_bare'),
            fk('fk_del', { onDelete: 'CASCADE' }),
            fk('fk_upd', { onUpdate: 'RESTRICT' }),
            fk('fk_both', { onDelete: 'CASCADE', onUpdate: 'RESTRICT' })
          ]
        })
      ),
      EMPTY
    );

    expect(sql).toContain('CONSTRAINT fk_bare FOREIGN KEY (owner_id) REFERENCES users (id),');
    expect(sql).toContain('CONSTRAINT fk_del FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE');
    expect(sql).toContain('CONSTRAINT fk_upd FOREIGN KEY (owner_id) REFERENCES users (id) ON UPDATE RESTRICT');
    expect(sql).toContain(
      'CONSTRAINT fk_both FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT'
    );
  });

  it('建表时一并建索引，UNIQUE 与否分别落字', () => {
    const sql = diffSqlSchema(
      schema(
        table('users', {
          columns: [col('email'), col('name')],
          indexes: [idx('idx_plain'), idx('idx_uniq', { unique: true, columns: ['name', 'email'] })]
        })
      ),
      EMPTY
    );

    expect(sql).toContain('CREATE INDEX idx_plain ON users (email);');
    expect(sql).toContain('CREATE UNIQUE INDEX idx_uniq ON users (name, email);');
  });
});

describe('diffSqlSchema — 表级增删', () => {
  it('两边一致时输出空串', () => {
    const same = () => schema(table('users', { columns: [col('id', { nullable: false, primaryKey: true })] }));

    expect(diffSqlSchema(same(), same())).toBe('');
  });

  it('remote 有而 desired 无 → DROP TABLE', () => {
    expect(diffSqlSchema(EMPTY, schema(table('legacy')))).toBe('DROP TABLE legacy;');
  });

  it('DROP 先于 CREATE，避免同名重建撞车', () => {
    const sql = diffSqlSchema(schema(table('b', { columns: [col('id')] })), schema(table('a')));

    expect(sql.indexOf('DROP TABLE a;')).toBeLessThan(sql.indexOf('CREATE TABLE b ('));
  });
});

describe('diffSqlSchema — 列级增删改', () => {
  const remoteUsers = (...columns: SqlColumn[]) => schema(table('users', { columns }));

  it('desired 少了列 → DROP COLUMN', () => {
    const sql = diffSqlSchema(remoteUsers(col('id')), remoteUsers(col('id'), col('legacy')));

    expect(sql).toBe('ALTER TABLE users DROP COLUMN legacy;');
  });

  it.each([
    [{ nullable: true }, 'ALTER TABLE users ADD COLUMN email text;'],
    [{ nullable: false }, 'ALTER TABLE users ADD COLUMN email text NOT NULL;'],
    [{ nullable: true, unique: true }, 'ALTER TABLE users ADD COLUMN email text UNIQUE;'],
    [{ nullable: false, unique: true }, 'ALTER TABLE users ADD COLUMN email text NOT NULL UNIQUE;']
  ])('新增列 %j → %s', (overrides, expected) => {
    const sql = diffSqlSchema(remoteUsers(col('id'), col('email', overrides)), remoteUsers(col('id')));

    expect(sql).toBe(expected);
  });

  it('类型变化 → ALTER COLUMN TYPE', () => {
    const sql = diffSqlSchema(remoteUsers(col('age', { type: 'bigint' })), remoteUsers(col('age', { type: 'int' })));

    expect(sql).toBe('ALTER TABLE users ALTER COLUMN age TYPE bigint;');
  });

  it.each([
    [true, false, 'ALTER TABLE users ALTER COLUMN email DROP NOT NULL;'],
    [false, true, 'ALTER TABLE users ALTER COLUMN email SET NOT NULL;']
  ])('nullable %s ← %s → %s', (desired, remote, expected) => {
    const sql = diffSqlSchema(
      remoteUsers(col('email', { nullable: desired })),
      remoteUsers(col('email', { nullable: remote }))
    );

    expect(sql).toBe(expected);
  });

  it('类型与 nullable 同时变化 → 两条语句', () => {
    const sql = diffSqlSchema(
      remoteUsers(col('age', { type: 'bigint', nullable: false })),
      remoteUsers(col('age', { type: 'int', nullable: true }))
    );

    expect(sql.split('\n')).toEqual([
      'ALTER TABLE users ALTER COLUMN age TYPE bigint;',
      'ALTER TABLE users ALTER COLUMN age SET NOT NULL;'
    ]);
  });

  /**
   * `columnsEqual` 比的六项里，只有 type / nullable 会产出 ALTER 语句。
   * 另外四项（primaryKey / unique / defaultValue / check）**差异被识别但生成不出 SQL**——
   * 函数返回空串，而两边其实不一致。这不是本用例发现的缺陷，是把现状钉住：
   * 哪天补上这四项的 ALTER，这里会先红，逼着一起更新。
   */
  it.each([
    ['primaryKey', { primaryKey: true }],
    ['unique', { unique: true }],
    ['defaultValue', { defaultValue: "'x'" }],
    ['check', { check: 'length(email) > 0' }]
  ])('%s 差异被 columnsEqual 识别，但当前生成不出 ALTER（现状钉死）', (_label, overrides) => {
    const sql = diffSqlSchema(remoteUsers(col('email', overrides)), remoteUsers(col('email')));

    expect(sql).toBe('');
  });

  it('defaultValue 的 undefined 与 null 视为同一件事', () => {
    const sql = diffSqlSchema(
      remoteUsers(col('email', { defaultValue: null, check: null })),
      remoteUsers(col('email'))
    );

    expect(sql).toBe('');
  });
});

describe('diffSqlSchema — 索引与外键增删', () => {
  const withIndexes = (...indexes: SqlIndex[]) => schema(table('users', { columns: [col('email')], indexes }));
  const withFks = (...foreignKeys: SqlForeignKey[]) =>
    schema(table('posts', { columns: [col('owner_id')], foreignKeys }));

  it('remote 多出的索引 → DROP INDEX', () => {
    expect(diffSqlSchema(withIndexes(), withIndexes(idx('idx_old')))).toBe('DROP INDEX idx_old;');
  });

  it.each([
    [false, 'CREATE INDEX idx_new ON users (email);'],
    [true, 'CREATE UNIQUE INDEX idx_new ON users (email);']
  ])('已有表上新增索引（unique=%s）', (unique, expected) => {
    expect(diffSqlSchema(withIndexes(idx('idx_new', { unique })), withIndexes())).toBe(expected);
  });

  it('同名索引不重建（只按名字比对，不比列）', () => {
    const sql = diffSqlSchema(withIndexes(idx('idx_same', { columns: ['name'] })), withIndexes(idx('idx_same')));

    expect(sql).toBe('');
  });

  it('remote 多出的外键 → DROP CONSTRAINT', () => {
    expect(diffSqlSchema(withFks(), withFks(fk('fk_old')))).toBe('ALTER TABLE posts DROP CONSTRAINT fk_old;');
  });

  it.each([
    [{}, 'ALTER TABLE posts ADD CONSTRAINT fk_new FOREIGN KEY (owner_id) REFERENCES users (id);'],
    [
      { onDelete: 'CASCADE' },
      'ALTER TABLE posts ADD CONSTRAINT fk_new FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE;'
    ],
    [
      { onUpdate: 'RESTRICT' },
      'ALTER TABLE posts ADD CONSTRAINT fk_new FOREIGN KEY (owner_id) REFERENCES users (id) ON UPDATE RESTRICT;'
    ],
    [
      { onDelete: 'CASCADE', onUpdate: 'RESTRICT' },
      'ALTER TABLE posts ADD CONSTRAINT fk_new FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT;'
    ]
  ])('已有表上新增外键 %j', (overrides, expected) => {
    expect(diffSqlSchema(withFks(fk('fk_new', overrides)), withFks())).toBe(expected);
  });

  it('同名外键不重建', () => {
    expect(diffSqlSchema(withFks(fk('fk_same')), withFks(fk('fk_same', { onDelete: 'CASCADE' })))).toBe('');
  });
});
