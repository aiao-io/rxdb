/**
 * 可注入的 SQL 事务执行器（dry-run / execute）
 */

export interface SqlExecOptions {
  /** true = COMMIT，false = ROLLBACK（dry-run） */
  commit: boolean;
}

export interface SqlExecResult {
  ok: boolean;
  committed: boolean;
  affectedTables: string[];
  statementCount: number;
  error?: string;
}

export type SqlExecutor = (sql: string, options: SqlExecOptions) => Promise<SqlExecResult>;

const SQL_IDENTIFIER = String.raw`(?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*)`;
const SAFE_SQL_STATEMENTS = [
  new RegExp(String.raw`^CREATE\s+TABLE\s+${SQL_IDENTIFIER}\s*\([\s\S]*\)$`, 'i'),
  new RegExp(
    String.raw`^CREATE\s+(?:UNIQUE\s+)?INDEX\s+${SQL_IDENTIFIER}\s+ON\s+${SQL_IDENTIFIER}\s*\([\s\S]+\)$`,
    'i'
  ),
  new RegExp(String.raw`^ALTER\s+TABLE\s+${SQL_IDENTIFIER}\s+ADD\s+COLUMN\s+${SQL_IDENTIFIER}\s+[\s\S]+$`, 'i'),
  new RegExp(String.raw`^ALTER\s+TABLE\s+${SQL_IDENTIFIER}\s+ADD\s+CONSTRAINT\s+${SQL_IDENTIFIER}\s+[\s\S]+$`, 'i'),
  new RegExp(
    String.raw`^ALTER\s+TABLE\s+${SQL_IDENTIFIER}\s+ALTER\s+COLUMN\s+${SQL_IDENTIFIER}\s+(?:SET|DROP)\s+NOT\s+NULL$`,
    'i'
  )
];

function sqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map(statement => statement.replace(/^\s*(?:--[^\n]*(?:\n|$)\s*)*/, '').trim())
    .filter(statement => statement.length > 0);
}

/** 检测 SQL 是否超出模型设计器生成器的非破坏性 DDL 子集。 */
export function isDestructiveSql(sql: string): boolean {
  return sqlStatements(sql).some(statement => !SAFE_SQL_STATEMENTS.some(pattern => pattern.test(statement)));
}

/**
 * 从 SQL 粗提取涉及的表名（MVP：CREATE/ALTER/DROP TABLE）
 */
export function extractAffectedTables(sql: string): string[] {
  const names = new Set<string>();
  const re = /\b(?:CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?("([^"]+)"|([a-zA-Z_][\w$]*))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    names.add(m[2] ?? m[3]);
  }
  return [...names].sort();
}

function countStatements(sql: string): number {
  return sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--')).length;
}

/**
 * 默认内存 executor：不连真实 PG，记录调用供测试
 */
export function createMockSqlExecutor(log: Array<{ sql: string; commit: boolean }> = []): SqlExecutor {
  return async (sql, options) => {
    log.push({ sql, commit: options.commit });
    if (sql.includes('__FORCE_FAIL__')) {
      return {
        ok: false,
        committed: false,
        affectedTables: extractAffectedTables(sql),
        statementCount: countStatements(sql),
        error: 'forced failure'
      };
    }
    return {
      ok: true,
      committed: options.commit,
      affectedTables: extractAffectedTables(sql),
      statementCount: countStatements(sql)
    };
  };
}

/**
 * 使用 DATABASE_URL 的 postgres-js 事务执行器（可选；无 URL 时返回 null）
 */
export function createPgSqlExecutor(databaseUrl: string | undefined): SqlExecutor | null {
  if (!databaseUrl?.trim()) return null;
  return async (sql, options) => {
    const { default: postgres } = await import('postgres');
    const sqlClient = postgres(databaseUrl, { prepare: false, max: 1 });
    try {
      await sqlClient.begin(async tx => {
        await tx.unsafe(sql);
        if (!options.commit) {
          throw new RollbackSignal();
        }
      });
      return {
        ok: true,
        committed: options.commit,
        affectedTables: extractAffectedTables(sql),
        statementCount: countStatements(sql)
      };
    } catch (e) {
      if (e instanceof RollbackSignal) {
        return {
          ok: true,
          committed: false,
          affectedTables: extractAffectedTables(sql),
          statementCount: countStatements(sql)
        };
      }
      return {
        ok: false,
        committed: false,
        affectedTables: extractAffectedTables(sql),
        statementCount: countStatements(sql),
        error: e instanceof Error ? e.message : String(e)
      };
    } finally {
      await sqlClient.end({ timeout: 1 });
    }
  };
}

class RollbackSignal extends Error {
  constructor() {
    super('dry-run-rollback');
    this.name = 'RollbackSignal';
  }
}
