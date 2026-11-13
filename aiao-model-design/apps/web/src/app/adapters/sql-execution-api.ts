import type {
  SqlExecutionAdapter,
  SqlExecutionPreview,
  SqlExecutionResult
} from '../model-designer/services/sql-execution-adapter';
import { SqlExecutionOutcomeUnknownError } from '../model-designer/services/sql-execution-adapter';

const DRY_RUN_URL = '/bff/model-designer/sql/dry-run';
const EXECUTE_URL = '/bff/model-designer/sql/execute';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

class SqlExecutionResponseError extends Error {}

function parseCommon(body: unknown): {
  sql: string;
  affectedTables: string[];
  statementCount: number;
  committed: boolean;
} | null {
  if (
    !isRecord(body) ||
    body['ok'] !== true ||
    typeof body['sql'] !== 'string' ||
    !isStringArray(body['affectedTables']) ||
    !Number.isInteger(body['statementCount']) ||
    (body['statementCount'] as number) < 0 ||
    typeof body['committed'] !== 'boolean'
  ) {
    return null;
  }
  return {
    sql: body['sql'],
    affectedTables: body['affectedTables'],
    statementCount: body['statementCount'] as number,
    committed: body['committed']
  };
}

async function apiError(response: Response, body: unknown): Promise<SqlExecutionResponseError> {
  if (isRecord(body)) {
    if (typeof body['message'] === 'string') return new SqlExecutionResponseError(body['message']);
    if (typeof body['error'] === 'string') return new SqlExecutionResponseError(body['error']);
    if (typeof body['code'] === 'string') return new SqlExecutionResponseError(body['code']);
  }
  return new SqlExecutionResponseError(`SQL execution request failed with HTTP ${response.status}`);
}

async function post(url: string, request: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(request),
    credentials: 'include'
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw await apiError(response, body);
  return body;
}

async function dryRun(sql: string): Promise<SqlExecutionPreview> {
  const body = await post(DRY_RUN_URL, { sql });
  const parsed = parseCommon(body);
  if (
    !parsed ||
    parsed.committed ||
    parsed.sql !== sql ||
    !isRecord(body) ||
    typeof body['destructive'] !== 'boolean'
  ) {
    throw new Error('SQL execution response is invalid');
  }
  return { ...parsed, committed: false, destructive: body['destructive'] };
}

async function execute(sql: string, confirmDestructive: boolean): Promise<SqlExecutionResult> {
  let body: unknown;
  try {
    body = await post(EXECUTE_URL, { sql, confirmDestructive });
  } catch (error) {
    if (error instanceof SqlExecutionResponseError) throw error;
    throw new SqlExecutionOutcomeUnknownError();
  }
  const parsed = parseCommon(body);
  if (!parsed?.committed || parsed.sql !== sql) throw new SqlExecutionOutcomeUnknownError();
  return { ...parsed, committed: true };
}

/** Dashboard's authenticated HTTP implementation of the model-designer SQL boundary. */
export const sqlExecutionApi: SqlExecutionAdapter = { dryRun, execute };
