// @vitest-environment node
import { Elysia } from 'elysia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createModelDesignerRoutes } from '../../src/routes/model-designer/routes';
import { createSnapshotSchemaReader } from '../../src/routes/model-designer/schema-reader';
import {
  createMockSqlExecutor,
  isDestructiveSql,
  type SqlExecutor
} from '../../src/routes/model-designer/sql-executor';

describe('model-designer SQL routes', () => {
  const internalToken = 'model-designer-test-token';
  const log: Array<{ sql: string; commit: boolean }> = [];

  const authorizedHeaders = { authorization: `Bearer ${internalToken}`, 'content-type': 'application/json' };

  const buildAppWithExecutor = (executor: SqlExecutor) =>
    new Elysia().group('/api', sub =>
      sub.use(
        createModelDesignerRoutes({
          executor,
          schemaReader: null
        })
      )
    );

  /** Elysia 的类型参数是 `const in out`，裸 `Elysia` 会把 `Routes` 钉成 `{}`；用工厂返回类型承接。 */
  const buildApp = () => buildAppWithExecutor(createMockSqlExecutor(log));

  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env['MODEL_DESIGNER_BACKEND_TOKEN'] = internalToken;
    log.length = 0;
    app = buildApp();
  });

  afterEach(() => {
    delete process.env['MODEL_DESIGNER_BACKEND_TOKEN'];
    delete process.env['NODE_ENV'];
  });

  it('POST /sql/diff returns ALTER/DROP and marks destructive', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/model-designer/sql/diff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          desired: {
            tables: [
              {
                name: 'users',
                columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
                foreignKeys: [],
                indexes: []
              }
            ]
          },
          remote: {
            tables: [
              {
                name: 'users',
                columns: [
                  { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
                  { name: 'legacy', type: 'text', nullable: true }
                ],
                foreignKeys: [],
                indexes: []
              },
              {
                name: 'gone',
                columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
                foreignKeys: [],
                indexes: []
              }
            ]
          }
        })
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.remoteSource).toBe('body');
    expect(body.sql).toContain('DROP TABLE gone;');
    expect(body.sql).toContain('DROP COLUMN legacy');
    expect(body.destructive).toBe(true);
  });

  it('POST /sql/diff without remote uses SchemaReader when provided', async () => {
    const remoteApp = new Elysia().group('/api', sub =>
      sub.use(
        createModelDesignerRoutes({
          executor: createMockSqlExecutor(log),
          schemaReader: createSnapshotSchemaReader({
            tables: [
              {
                name: 'users',
                columns: [
                  { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
                  { name: 'legacy', type: 'text', nullable: true }
                ],
                foreignKeys: [],
                indexes: []
              }
            ]
          })
        })
      )
    );
    const res = await remoteApp.handle(
      new Request('http://localhost/api/model-designer/sql/diff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          desired: {
            tables: [
              {
                name: 'users',
                columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
                foreignKeys: [],
                indexes: []
              }
            ]
          }
        })
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.remoteSource).toBe('reader');
    expect(body.sql).toContain('DROP COLUMN legacy');
  });

  it('POST /sql/diff without remote and without reader returns 400', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/model-designer/sql/diff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          desired: { tables: [] }
        })
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('remote_schema_required');
  });

  it('GET /sql/remote-schema returns snapshot when reader injected', async () => {
    const remote = {
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
          foreignKeys: [],
          indexes: []
        }
      ]
    };
    const remoteApp = new Elysia().group('/api', sub =>
      sub.use(
        createModelDesignerRoutes({
          executor: createMockSqlExecutor(log),
          schemaReader: createSnapshotSchemaReader(remote)
        })
      )
    );
    const res = await remoteApp.handle(
      new Request('http://localhost/api/model-designer/sql/remote-schema', { headers: authorizedHeaders })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.remote).toEqual(remote);
  });

  it('GET /sql/remote-schema without reader returns 503', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/model-designer/sql/remote-schema', { headers: authorizedHeaders })
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('schema_reader_unavailable');
  });

  it('dry-run rolls back (commit:false) and execute commits', async () => {
    const sql = 'CREATE TABLE demo (id uuid PRIMARY KEY);';
    const dry = await app.handle(
      new Request('http://localhost/api/model-designer/sql/dry-run', {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({ sql })
      })
    );
    expect(dry.status).toBe(200);
    const dryBody = await dry.json();
    expect(dryBody.ok).toBe(true);
    expect(dryBody.committed).toBe(false);
    expect(log[0]).toEqual({ sql, commit: false });

    const exec = await app.handle(
      new Request('http://localhost/api/model-designer/sql/execute', {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({ sql })
      })
    );
    expect(exec.status).toBe(200);
    const execBody = await exec.json();
    expect(execBody.ok).toBe(true);
    expect(execBody.committed).toBe(true);
    expect(log[1]).toEqual({ sql, commit: true });
  });

  it('fails closed when dry-run executor reports a committed transaction', async () => {
    const sql = 'CREATE TABLE leaked (id uuid);';
    const inconsistentApp = buildAppWithExecutor(async () => ({
      ok: true,
      committed: true,
      affectedTables: ['leaked'],
      statementCount: 1
    }));

    const res = await inconsistentApp.handle(
      new Request('http://localhost/api/model-designer/sql/dry-run', {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({ sql })
      })
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: 'executor_contract_violation',
      sql,
      committed: true
    });
  });

  it('fails closed when execute executor does not report a committed transaction', async () => {
    const sql = 'CREATE TABLE uncommitted (id uuid);';
    const inconsistentApp = buildAppWithExecutor(async () => ({
      ok: true,
      committed: false,
      affectedTables: ['uncommitted'],
      statementCount: 1
    }));

    const res = await inconsistentApp.handle(
      new Request('http://localhost/api/model-designer/sql/execute', {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({ sql })
      })
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: 'executor_contract_violation',
      sql,
      committed: false
    });
  });

  it('execute without confirmDestructive returns 400 on DROP', async () => {
    const sql = 'DROP TABLE users;';
    const res = await app.handle(
      new Request('http://localhost/api/model-designer/sql/execute', {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({ sql })
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('destructive_confirmation_required');
    expect(body.sql).toBe(sql);
    expect(log).toHaveLength(0);
  });

  it.each([
    'TRUNCATE TABLE users;',
    'DROP VIEW active_users;',
    'DROP SCHEMA archive;',
    'DROP TYPE account_status;',
    'DROP SEQUENCE user_ids;',
    'DROP FUNCTION refresh_users();'
  ])('classifies destructive SQL: %s', sql => {
    expect(isDestructiveSql(sql)).toBe(true);
  });

  it.each([
    'DELETE FROM users;',
    "UPDATE users SET role = 'admin';",
    "INSERT INTO audit_log (message) VALUES ('manual');",
    'SELECT pg_terminate_backend(42);',
    'ALTER TABLE users ALTER COLUMN email TYPE varchar(8);'
  ])('fails closed for SQL outside the generated safe subset: %s', sql => {
    expect(isDestructiveSql(sql)).toBe(true);
  });

  it.each([
    'CREATE TABLE users (id uuid);',
    'CREATE UNIQUE INDEX idx_users_email ON users (email);',
    'ALTER TABLE users ADD COLUMN name text;',
    'ALTER TABLE users ADD CONSTRAINT users_pk PRIMARY KEY (id);',
    'ALTER TABLE users ALTER COLUMN email SET NOT NULL;',
    'ALTER TABLE users ALTER COLUMN email DROP NOT NULL;'
  ])('allows generated non-destructive SQL without danger confirmation: %s', sql => {
    expect(isDestructiveSql(sql)).toBe(false);
  });

  it('execute with confirmDestructive allows DROP', async () => {
    const sql = 'DROP TABLE users;';
    const res = await app.handle(
      new Request('http://localhost/api/model-designer/sql/execute', {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({ sql, confirmDestructive: true })
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(log).toHaveLength(1);
  });

  it('failed execute keeps sql and does not commit', async () => {
    const sql = 'CREATE TABLE x (id uuid); -- __FORCE_FAIL__';
    const res = await app.handle(
      new Request('http://localhost/api/model-designer/sql/execute', {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({ sql })
      })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.sql).toBe(sql);
    expect(body.committed).toBe(false);
  });

  it('rejects protected SQL routes without the internal bearer', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/model-designer/sql/dry-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: 'CREATE TABLE blocked (id uuid);' })
      })
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'unauthorized' });
    expect(log).toHaveLength(0);
  });

  it('fails closed in production when the internal bearer is not configured', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['MODEL_DESIGNER_BACKEND_TOKEN'];

    const res = await app.handle(
      new Request('http://localhost/api/model-designer/sql/dry-run', {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({ sql: 'CREATE TABLE blocked (id uuid);' })
      })
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: 'config-error' });
    expect(log).toHaveLength(0);
  });

  it('fails closed in production when DATABASE_URL and an injected executor are missing', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['DATABASE_URL'];
    const unconfiguredApp = new Elysia().group('/api', sub =>
      sub.use(createModelDesignerRoutes({ schemaReader: null }))
    );
    const sql = 'CREATE TABLE blocked (id uuid);';

    const res = await unconfiguredApp.handle(
      new Request('http://localhost/api/model-designer/sql/execute', {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({ sql })
      })
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: 'adapter_not_configured'
    });
  });

  it('preflights destructive SQL without confirmation and never commits', async () => {
    const sql = 'DROP TABLE users;';
    const res = await app.handle(
      new Request('http://localhost/api/model-designer/sql/dry-run', {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({ sql })
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      committed: false,
      destructive: true,
      affectedTables: ['users'],
      statementCount: 1,
      sql
    });
    expect(log).toEqual([{ sql, commit: false }]);
  });
});
