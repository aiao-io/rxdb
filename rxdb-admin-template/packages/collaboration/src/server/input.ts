import { demand, permissions, type AuditQuery, type Command, type HistoryQuery } from '../model.js';
import { assertChanges } from '../records.js';
import { parseSchemaManifest } from '../schema.js';
type Rule = (value: unknown) => boolean;
const text: Rule = value => typeof value === 'string' && value.length <= 10000;
const label: Rule = value => text(value) && (value as string).trim().length > 0;
const id: Rule = value =>
  typeof value === 'string' &&
  /^[a-zA-Z0-9_-]{1,128}$/.test(value) &&
  !['__proto__', 'constructor', 'prototype'].includes(value);
const nullableId: Rule = value => value === null || id(value);
const integer: Rule = value => Number.isSafeInteger(value) && Number(value) >= 0;
const boolean: Rule = value => typeof value === 'boolean';
const list =
  (check: Rule, maximum = 100): Rule =>
  value =>
    Array.isArray(value) && value.length <= maximum && value.every(check);
const oneOf =
  (...values: unknown[]): Rule =>
  value =>
    values.includes(value);
const object =
  (rules: Record<string, Rule>): Rule =>
  value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      Object.keys(record).every(key => Object.hasOwn(rules, key)) &&
      Object.entries(rules).every(([key, rule]) => rule(record[key]))
    );
  };
const fingerprint: Rule = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
/** 上传的提交：字段级变更与客户端计算的内容指纹；合并关联只由服务端在合并时写入，不接受客户端提供。 */
const commit: Rule = object({
  id,
  parent: nullableId,
  authorId: id,
  message: label,
  changes: value => {
    assertChanges(value);
    return true;
  },
  fingerprint
});
const stage = object({ id, name: label, minimum: integer, reviewers: list(id), after: list(id) });
const resolution: Rule = value => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).every(key => ['key', 'choice', 'value'].includes(key)) &&
    typeof record['key'] === 'string' &&
    /^[a-zA-Z0-9_-]+\/(\$record|[a-zA-Z0-9_]+)$/.test(record['key']) &&
    oneOf('source', 'target', 'custom')(record['choice'])
  );
};
const shapes: Record<Command['type'], Record<string, Rule>> = {
  invite: {
    id,
    email: label,
    permissions: list(oneOf(...permissions), 6),
    tokenHash: label,
    expiresAt: integer,
    expectedVersion: integer
  },
  revoke_invite: { id, expectedVersion: integer },
  accept_invite: { id, tokenHash: label },
  member: { userId: id, permissions: list(oneOf(...permissions), 6), active: boolean, expectedGeneration: integer },
  policy: { stages: list(stage, 20), expectedVersion: integer },
  // 新的数据模式清单按格式严格解析（不合法即 invalid）；版本是否递增、共享记录能否通过由引擎裁决
  schema: {
    schema: value => {
      parseSchemaManifest(value);
      return true;
    },
    expectedVersion: integer
  },
  task: { id, name: label, expectedHead: nullableId },
  upload: { taskId: id, expectedHead: nullableId, commits: list(commit) },
  fork: { id, name: label, taskId: id, expectedHead: nullableId, commits: list(commit) },
  pr: { id, taskId: id, title: label, description: text, target: oneOf('shared') },
  pr_state: { prId: id, status: oneOf('draft', 'review', 'closed'), expectedRevision: integer },
  candidate: { prId: id, expectedRevision: integer, resolutions: list(resolution, 10000) },
  review: {
    prId: id,
    candidateId: nullableId,
    expectedSource: id,
    stageId: id,
    decision: oneOf('approve', 'request_changes'),
    reason: text,
    expectedRevision: integer
  },
  dismiss: { prId: id, reviewerId: id, reason: label, expectedRevision: integer },
  thread: {
    id,
    prId: id,
    candidateId: nullableId,
    recordId: nullableId,
    field: nullableId,
    body: label,
    required: boolean,
    mentions: list(id)
  },
  reply: { threadId: id, body: label, mentions: list(id) },
  edit_comment: { threadId: id, commentId: id, body: text, deleted: boolean, expectedRevision: integer },
  resolve_thread: { threadId: id, resolved: boolean, expectedRevision: integer },
  subscribe: { prId: id, subscribed: boolean },
  read_notice: { id },
  presence: { sessionId: id, prId: nullableId, recordId: nullableId, leave: boolean },
  merge: { prId: id, candidateId: id, expectedSource: id, expectedTarget: nullableId }
};
/** 对不可信 JSON 完整校验，拒绝客户端主体、任意表名和额外属性。 */
export function parseCommand(value: unknown): Command {
  demand(value && typeof value === 'object', 'invalid', '请求格式错误');
  const command = value as Record<string, unknown>;
  demand(typeof command['type'] === 'string' && Object.hasOwn(shapes, command['type']), 'invalid', '操作不受支持');
  const shape = shapes[command['type'] as Command['type']];
  demand(object({ type: oneOf(command['type']), operationId: id, ...shape })(command), 'invalid', '请求字段不合法');
  return command as unknown as Command;
}

/**
 * 分页查询参数的通用解析：只接受 `keys` 与 `limit`，每个至多出现一次；标识须符合命令里的标识格式，
 * `limit` 须是不超过三位的非负整数（取值范围由引擎裁决）。
 */
function parsePageQuery(params: URLSearchParams, keys: readonly string[]) {
  const names = [...params.keys()];
  const known: readonly string[] = [...keys, 'limit'];
  demand(new Set(names).size === names.length && names.every(key => known.includes(key)), 'invalid', '请求字段不合法');
  const values: Record<string, string> = {};
  for (const key of keys) {
    const value = params.get(key);
    if (value === null) continue;
    demand(id(value), 'invalid', '请求字段不合法');
    values[key] = value;
  }
  const limit = params.get('limit');
  if (limit === null) return { values };
  demand(/^\d{1,3}$/.test(limit), 'invalid', '请求字段不合法');
  return { values, limit: Number(limit) };
}
/** 审计分页的查询参数：before、limit、prId、threadId，规则见 {@link parsePageQuery}。 */
export function parseAuditQuery(params: URLSearchParams): AuditQuery {
  const { values, limit } = parsePageQuery(params, ['before', 'prId', 'threadId']);
  return { ...values, ...(limit === undefined ? {} : { limit }) };
}
/** 数据模式版本的路径参数：1 起的十进制整数，不超过 9 位。 */
export function parseSchemaVersion(value: string | undefined): number {
  demand(value !== undefined && /^[1-9]\d{0,8}$/.test(value), 'invalid', '请求字段不合法');
  return Number(value);
}
/**
 * 提交历史分页的查询参数：branch（只能是 shared）、taskId、prId 三者恰好取一，外加 before、limit，规则见 {@link parsePageQuery}。
 */
export function parseHistoryQuery(params: URLSearchParams): HistoryQuery {
  const { values, limit } = parsePageQuery(params, ['branch', 'taskId', 'prId', 'before']);
  const { branch, ...rest } = values;
  demand(branch === undefined || branch === 'shared', 'invalid', '请求字段不合法');
  demand(
    [branch, rest['taskId'], rest['prId']].filter(value => value !== undefined).length === 1,
    'invalid',
    '请求字段不合法'
  );
  return { ...rest, ...(branch === undefined ? {} : { branch }), ...(limit === undefined ? {} : { limit }) };
}
