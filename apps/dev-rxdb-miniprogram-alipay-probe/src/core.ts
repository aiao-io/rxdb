/**
 * @fileoverview 核心包入口：实验 ① 持久化、④ 配额，以及 adapter 的能力预检。
 *
 * 只走 adapter 的公开 API（`createWaSqliteMiniProgramClient` + 注入正式支付宝 host），与真实调用方的路径一致。
 * 每一步失败都记下停在哪一步与原始错误，不重试。
 */
import {
  checkMiniProgramRuntimeCapabilities,
  createWaSqliteMiniProgramClient,
  loadSubframeModuleFactory,
  type MiniProgramWasmRuntime,
  type WaSqliteMiniProgramClient,
  type WaSqliteModuleFactory
} from '@aiao/rxdb-adapter-miniprogram';
import { listFiles as listDirectory } from './alipay-fs.js';
import type {
  CoreExperimentInput,
  CoreExperimentReport,
  DatabaseFile,
  JsonCell,
  PersistenceReport,
  QuotaAfterFailure,
  QuotaReport
} from './core-contract.js';
import { describeError } from './describe-error.js';
import { probe } from './probe.js';
import { readRealmProbe } from './realm-probe.js';

/** 核心包的 realm 探测记录，必须在本包内读：每个包的 banner 变量只在自己的模块作用域里。 */
export const realmProbe = readRealmProbe();

/** 持久化实验写入的行：覆盖多字节中文、四字节 emoji 与引号。 */
const SAMPLE_ROWS: readonly (readonly [number, string])[] = [
  [1, '中文与 emoji 🚀'],
  [2, 'plain ascii'],
  [3, '单引号 \' 与双引号 "']
];

interface CoreContext extends CoreExperimentInput {
  readonly moduleFactory: WaSqliteModuleFactory;
  /** adapter 最近一次交给 `instantiate` 的路径。 */
  readonly loadedWasmPath: { value: string | null };
}

/** 包一层 `instantiate`，记下 adapter 实际加载的路径；其余行为原样转发。 */
function recordWasmPath(runtime: MiniProgramWasmRuntime, loaded: { value: string | null }): MiniProgramWasmRuntime {
  return {
    ...runtime,
    instantiate: (path, imports) => {
      loaded.value = path;
      return runtime.instantiate(path, imports);
    }
  };
}

/** 实验进行到哪一步；失败时写进报告。 */
interface StageTracker {
  stage: string;
}

function toJsonCell(value: unknown): JsonCell {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return `<blob ${value.byteLength} bytes>`;
  return `<${typeof value}>`;
}

async function selectRows(client: WaSqliteMiniProgramClient, sql: string): Promise<JsonCell[][]> {
  const result = await client.execute(sql);
  return (result.results[0]?.rows ?? []).map(row => row.map(toJsonCell));
}

async function selectScalar(client: WaSqliteMiniProgramClient, sql: string): Promise<JsonCell> {
  const rows = await selectRows(client, sql);
  if (rows.length === 0) throw new Error(`${sql} 没有返回行`);
  return rows[0][0];
}

function openClient(context: CoreContext, dbName: string): Promise<WaSqliteMiniProgramClient> {
  return createWaSqliteMiniProgramClient(dbName, {
    host: context.host,
    moduleFactory: context.moduleFactory,
    wasmRuntime: context.wasmRuntime,
    databaseRoot: context.databaseRoot
  });
}

/** 打开连接、执行、关闭；主体失败时以主体错误为准，关闭的错误只打日志。 */
async function withClient<T>(
  context: CoreContext,
  dbName: string,
  tracker: StageTracker,
  body: (client: WaSqliteMiniProgramClient) => Promise<T>
): Promise<T> {
  const client = await openClient(context, dbName);
  let result: T;
  try {
    result = await body(client);
  } catch (error) {
    await client.disconnect().catch(closeError => console.error('[alipay-probe] 失败后关闭连接出错：', closeError));
    throw error;
  }
  tracker.stage = `关闭 ${dbName}`;
  await client.disconnect();
  return result;
}

function listFiles(context: CoreContext): DatabaseFile[] {
  return listDirectory(context.fileSystem, context.databaseRoot);
}

function persistenceVerdict(report: Omit<PersistenceReport, 'status'>): PersistenceReport {
  const sameRows = JSON.stringify(report.reopenedRows) === JSON.stringify(report.writtenRows);
  if (sameRows && report.integrity === 'ok') return { status: 'passed', ...report };
  const reason = sameRows ? `integrity_check 返回 ${String(report.integrity)}` : '重开后读回的行与写入不一致';
  return { status: 'failed', ...report, failure: { stage: '比对', error: describeError(new Error(reason)) } };
}

async function runPersistence(context: CoreContext): Promise<PersistenceReport> {
  const tracker: StageTracker = { stage: '打开 persistence' };
  const partial: { -readonly [K in keyof PersistenceReport]?: PersistenceReport[K] } = {};
  try {
    partial.writtenRows = await withClient(context, 'persistence', tracker, async client => {
      tracker.stage = '建表并写入';
      await client.execute('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
      for (const [id, body] of SAMPLE_ROWS)
        await client.execute('INSERT INTO notes (id, body) VALUES (?, ?)', [id, body]);
      return selectRows(client, 'SELECT id, body FROM notes ORDER BY id');
    });
    tracker.stage = '重开 persistence';
    await withClient(context, 'persistence', tracker, async client => {
      tracker.stage = '重开后读回';
      partial.reopenedRows = await selectRows(client, 'SELECT id, body FROM notes ORDER BY id');
      tracker.stage = 'integrity_check';
      partial.integrity = await selectScalar(client, 'PRAGMA integrity_check');
    });
    tracker.stage = '列出数据库文件';
    partial.files = listFiles(context);
  } catch (error) {
    return {
      status: 'failed',
      ...partial,
      wasmPath: context.loadedWasmPath.value,
      failure: { stage: tracker.stage, error: describeError(error) }
    };
  }
  return persistenceVerdict({ ...partial, wasmPath: context.loadedWasmPath.value });
}

/** 撞配额后：同连接还能不能读、关掉重开能不能读到全部已提交行、库是否完整。 */
async function inspectAfterFailure(
  context: CoreContext,
  client: WaSqliteMiniProgramClient
): Promise<QuotaAfterFailure> {
  const countSql = 'SELECT count(*) FROM blobs';
  const sameConnectionCount = await probe(() => selectScalar(client, countSql));
  const disconnect = await probe(async () => {
    await client.disconnect();
    return null;
  });
  const filesAfterDisconnect = await probe(() => listFiles(context));
  const reopened = await probe(() => openClient(context, 'quota'));
  const before = { sameConnectionCount, disconnect, filesAfterDisconnect };
  if (!reopened.ok) return { ...before, reopenCount: reopened, reopenIntegrity: reopened };
  const reopenCount = await probe(() => selectScalar(reopened.value, countSql));
  const reopenIntegrity = await probe(() => selectScalar(reopened.value, 'PRAGMA integrity_check'));
  await reopened.value.disconnect();
  return { ...before, reopenCount, reopenIntegrity };
}

async function insertUntilFailure(
  client: WaSqliteMiniProgramClient,
  plan: CoreContext['quotaPlan']
): Promise<{ insertedRows: number; failure?: QuotaReport['failure'] }> {
  for (let row = 0; row < plan.maxRows; row++) {
    try {
      // 用 zeroblob 而不是 randomblob：后者会把宿主随机池耗在与实验无关的地方
      await client.execute('INSERT INTO blobs (payload) VALUES (zeroblob(?))', [plan.blobBytes]);
    } catch (error) {
      return { insertedRows: row, failure: { atRow: row + 1, error: describeError(error) } };
    }
  }
  return { insertedRows: plan.maxRows };
}

async function runQuota(context: CoreContext): Promise<QuotaReport> {
  const plan = context.quotaPlan;
  const tracker: StageTracker = { stage: '打开 quota' };
  let client: WaSqliteMiniProgramClient | undefined;
  try {
    client = await openClient(context, 'quota');
    tracker.stage = '建表';
    await client.execute('CREATE TABLE blobs (id INTEGER PRIMARY KEY, payload BLOB NOT NULL)');
  } catch (error) {
    await client?.disconnect().catch(closeError => console.error('[alipay-probe] 失败后关闭连接出错：', closeError));
    return {
      status: 'failed',
      plan,
      insertedRows: 0,
      stageFailure: { stage: tracker.stage, error: describeError(error) }
    };
  }
  const opened = client;
  const { insertedRows, failure } = await insertUntilFailure(opened, plan);
  if (failure) {
    return {
      status: 'triggered',
      plan,
      insertedRows,
      failure,
      afterFailure: await inspectAfterFailure(context, opened)
    };
  }
  const closed = await probe(() => opened.disconnect());
  if (closed.ok) return { status: 'not-triggered', plan, insertedRows };
  return { status: 'failed', plan, insertedRows, stageFailure: { stage: '关闭 quota', error: closed.error } };
}

/** 依次跑能力预检、持久化、配额。调用前页面包必须已经完成 `prepareMiniProgramHostRuntime`。 */
export async function runCoreExperiments(input: CoreExperimentInput): Promise<CoreExperimentReport> {
  const loadedWasmPath: CoreContext['loadedWasmPath'] = { value: null };
  const context: CoreContext = {
    ...input,
    wasmRuntime: recordWasmPath(input.wasmRuntime, loadedWasmPath),
    moduleFactory: await loadSubframeModuleFactory(),
    loadedWasmPath
  };
  const capabilities = await probe(() =>
    checkMiniProgramRuntimeCapabilities({
      host: context.host,
      moduleFactory: context.moduleFactory,
      wasmRuntime: context.wasmRuntime,
      databaseRoot: context.databaseRoot
    }).map(({ name, available, source }) => ({ name, available, source }))
  );
  const persistence = await runPersistence(context);
  const quota = await runQuota(context);
  return { capabilities, persistence, quota };
}
