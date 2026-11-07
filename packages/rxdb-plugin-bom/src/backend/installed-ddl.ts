import type { TransactionExecutor } from '@aiao/rxdb';
import { isBomPostgres } from '../resolve/bom-sql.js';

export const executeDdl = async (executor: TransactionExecutor, statement: string): Promise<void> => {
  try {
    await executor.query(statement);
  } catch (error) {
    throw new Error(`BOM 触发器 DDL 安装失败：${statement}`, { cause: error });
  }
};

/** 一批安装语句所定义的对象；认不出的语句没有对象可比对，整批不可跳过。 */
interface DdlObjects {
  triggers: string[];
  functions: { schema: string; name: string }[];
}

const TRIGGER_STATEMENT = /^(?:DROP\s+TRIGGER\s+IF\s+EXISTS|CREATE\s+TRIGGER)\s+"([^"]+)"/i;
const FUNCTION_STATEMENT = /^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"([^"]+)"\."([^"]+)"\s*\(/i;
// PGlite 解析不了裸 CREATE TRIGGER 时的 DO 块形态：块内只许 DROP / CREATE TRIGGER
const DO_BLOCK = /^DO\s+\$\$\s*BEGIN\s+([\s\S]*?)\s*END\s*\$\$\s*;?$/i;

const objectsOf = (statement: string): DdlObjects | undefined => {
  const text = statement.trim();
  const fn = FUNCTION_STATEMENT.exec(text);
  if (fn) return { triggers: [], functions: [{ schema: fn[1], name: fn[2] }] };
  const parts = DO_BLOCK.exec(text)?.[1]
    .split(';')
    .map(part => part.trim()) ?? [text];
  const names = parts.filter(part => part !== '').map(part => TRIGGER_STATEMENT.exec(part)?.[1]);
  return names.every(name => name !== undefined) ? { triggers: names, functions: [] } : undefined;
};

const collectObjects = (statements: readonly string[]): DdlObjects | undefined => {
  const all: DdlObjects = { triggers: [], functions: [] };
  for (const statement of statements) {
    const objects = objectsOf(statement);
    if (objects === undefined) return undefined;
    all.triggers.push(...objects.triggers);
    all.functions.push(...objects.functions);
  }
  return all;
};

/**
 * SQLite：目录里存的就是建触发器语句原文（去掉首尾空白与结尾分号），逐条按创建序比对。
 *
 * @remarks
 * 创建序（rowid）也要一致：同表同事件的触发器按逆创建序执行，决定多个守卫同时违约时先报哪一个。
 * 只比本批语句点名的触发器（含只删不建的旧名），核心的变更日志触发器不在其中。
 */
const sqliteDdlIsCurrent = async (executor: TransactionExecutor, statements: readonly string[]): Promise<boolean> => {
  const objects = collectObjects(statements);
  if (objects === undefined || objects.functions.length > 0) return false;
  const names = new Set(objects.triggers);
  const expected = statements
    .map(statement => statement.trim())
    .filter(statement => /^CREATE\s+TRIGGER\b/i.test(statement))
    .map(statement => statement.replace(/;$/, ''));
  const { rows } = await executor.query(
    `SELECT "name", "sql" FROM sqlite_master WHERE "type" = 'trigger' ORDER BY rowid`
  );
  const installed = rows.filter(row => names.has(String(row[0]))).map(row => String(row[1]));
  return installed.length === expected.length && installed.every((sql, index) => sql === expected[index]);
};

/**
 * PG 安装指纹：本批语句全文与它点名的函数 / 触发器的目录定义一并取 SHA-256。
 *
 * @remarks
 * PG 不存触发器原文（`pg_get_triggerdef` 是反解析结果），无法像 SQLite 那样直接比对语句；
 * 改为全量安装后在同一事务里把指纹记进本插件命名空间的 schema 注释。目录定义入指纹，
 * 是因为旧版本客户端、表重建或手工 DDL 改动对象时不会更新注释——只认注释会把它们当成已装。
 * 触发器按名字限定在本命名空间的表上，函数按「schema.名字」限定，核心的变更日志对象不在其中。
 * 恒返回一行：schema 不存在时注释为空、判为未装，由随后的 DDL 报出真实错误。
 */
const PG_FINGERPRINT_SQL = `SELECT obj_description(n.oid, 'pg_namespace'),
  encode(sha256(convert_to(length($1::text)::text || ':' || $1::text || coalesce((
    SELECT string_agg(definition, E'\\n' ORDER BY definition) FROM (
      SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p
      WHERE p.pronamespace = n.oid AND p.proname = ANY(string_to_array($4::text, ','))
      UNION ALL
      SELECT t.tgenabled::text || pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace = n.oid AND t.tgname = ANY(string_to_array($3::text, ','))
    ) installed
  ), ''), 'UTF8')), 'hex')
  FROM (SELECT $2::text AS nspname) target LEFT JOIN pg_namespace n ON n.nspname = target.nspname`;

/** 已记的注释与按当前目录算出的指纹；本批语句认不全、或函数不在同一个 schema 时为 `undefined`。 */
const readPgFingerprint = async (
  executor: TransactionExecutor,
  statements: readonly string[]
): Promise<{ schema: string; recorded: unknown; installed: string } | undefined> => {
  const objects = collectObjects(statements);
  const schemas = new Set(objects?.functions.map(fn => fn.schema));
  if (objects === undefined || schemas.size !== 1) return undefined;
  const [schema] = schemas;
  const { rows } = await executor.query(PG_FINGERPRINT_SQL, [
    statements.join('\n'),
    schema,
    objects.triggers.join(','),
    objects.functions.map(fn => fn.name).join(',')
  ]);
  return { schema, recorded: rows[0][0], installed: String(rows[0][1]) };
};

/** 库里已装的存储层定义与一批安装语句的比对与记录。 */
export interface InstalledBomDdl {
  /** 库里的对象恰是这批语句的产出（任一处不同、缺失或多出旧名即为 `false`） */
  isCurrent(executor: TransactionExecutor): Promise<boolean>;
  /** 全量下发之后、同一事务内记下本次安装（SQLite 目录原文即记录，无需另写） */
  record(executor: TransactionExecutor): Promise<void>;
}

/**
 * 按后端构造已装定义的比对器（导出供单测）。
 *
 * @param adapterName - 本地适配器名；PGlite 及其 Electron 宿主使用 PG 方言，其余已支持后端使用 SQLite 方言
 * @param statements - 与安装同序的全部 DDL
 * @returns 判定与记录两个动作，都在调用方的同一个安装事务里执行
 *
 * @remarks
 * 只有定义完全一致才跳过：插件升级改了任一条语句、旧版本客户端重装了自己的定义、表重建丢了触发器，
 * 都会判为未装并整批重装，升级后旧体不会留在库里。认不出的语句（触发器 / 触发器函数之外的 DDL）
 * 没有可比对的目录对象，整批永远判为未装。
 */
export const installedBomDdl = (adapterName: string, statements: readonly string[]): InstalledBomDdl => {
  if (!isBomPostgres(adapterName)) {
    return { isCurrent: executor => sqliteDdlIsCurrent(executor, statements), record: () => Promise.resolve() };
  }
  return {
    isCurrent: async executor => {
      const fingerprint = await readPgFingerprint(executor, statements);
      return fingerprint !== undefined && fingerprint.recorded === fingerprint.installed;
    },
    record: async executor => {
      const fingerprint = await readPgFingerprint(executor, statements);
      if (fingerprint === undefined) return;
      await executeDdl(executor, `COMMENT ON SCHEMA "${fingerprint.schema}" IS '${fingerprint.installed}'`);
    }
  };
};
