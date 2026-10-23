import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';

const runFile = promisify(execFile);
const pgBinary = (name: string): string =>
  process.env.RXDB_BOM_PG_BIN ? join(process.env.RXDB_BOM_PG_BIN, name) : name;
const runPg = (name: string, args: string[]) => runFile(pgBinary(name), args, { timeout: 30000 });

/** 测试独占的 PostgreSQL 集群，只监听随机临时目录内的 Unix socket。 */
export interface LocalPgFixture {
  connect(): Promise<Client>;
  stop(): Promise<void>;
}

/** 创建真实 PostgreSQL；缺少二进制或启动失败时直接让测试失败。 */
export const createLocalPgFixture = async (): Promise<LocalPgFixture> => {
  const root = await mkdtemp(join(tmpdir(), 'rxdb-bom-pg-'));
  const data = join(root, 'data');
  const sockets = join(root, 'socket');
  const log = join(root, 'postgres.log');
  const clients = new Set<Client>();
  let started = false;
  const stop = async (): Promise<void> => {
    try {
      await Promise.all([...clients].map(client => client.end()));
    } finally {
      if (started) await runPg('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '20', 'stop']);
      await rm(root, { recursive: true, force: true });
    }
  };
  try {
    await mkdir(sockets);
    await runPg('initdb', ['-D', data, '-U', 'bom_test_owner', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    await runPg('pg_ctl', [
      '-D',
      data,
      '-l',
      log,
      '-w',
      '-t',
      '20',
      '-o',
      `-h '' -k '${sockets.replace(/'/g, "'\\''")}' -p 5432 -c fsync=off -c synchronous_commit=off -c deadlock_timeout=100ms`,
      'start'
    ]);
    started = true;
  } catch (error) {
    const diagnostics = await readFile(log, 'utf8').catch(() => 'PostgreSQL 尚未生成日志');
    const status = await runPg('pg_ctl', ['-D', data, 'status']).then(
      () => true,
      () => false
    );
    started = status;
    await stop();
    throw new Error(`隔离 PostgreSQL 初始化失败：${diagnostics}`, { cause: error });
  }
  return {
    connect: async () => {
      const client = new Client({
        host: sockets,
        port: 5432,
        user: 'bom_test_owner',
        database: 'postgres',
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
        query_timeout: 10000,
        application_name: 'rxdb-bom-remote-cycle-test'
      });
      await client.connect();
      clients.add(client);
      return client;
    },
    stop
  };
};

/** 环约束实际读取的表与物理列，保持实体 bom schema 与 camelCase 列名。 */
export const createBomPgSchema = async (client: Client): Promise<void> => {
  await client.query(`
    DROP SCHEMA IF EXISTS bom CASCADE;
    CREATE SCHEMA bom;
    CREATE TABLE bom.item (id uuid PRIMARY KEY);
    CREATE TABLE bom.item_revision (id uuid PRIMARY KEY, "itemId" uuid NOT NULL REFERENCES bom.item);
    CREATE TABLE bom.bom_header (
      id uuid PRIMARY KEY,
      "parentRevisionId" uuid NOT NULL REFERENCES bom.item_revision,
      "bomType" text NOT NULL,
      "orgId" text NOT NULL
    );
    CREATE TABLE bom.bom_line (id uuid PRIMARY KEY, "headerId" uuid NOT NULL REFERENCES bom.bom_header);
    CREATE TABLE bom.bom_line_occurrence (
      id uuid PRIMARY KEY,
      "lineId" uuid NOT NULL REFERENCES bom.bom_line,
      "childItemId" uuid NOT NULL REFERENCES bom.item,
      "flowDirection" text NOT NULL DEFAULT 'consume'
    );
  `);
};
