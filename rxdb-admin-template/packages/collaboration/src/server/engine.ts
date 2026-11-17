import type { RecordCheck } from '../checks.js';
import {
  demand,
  permissions,
  type Audit,
  type Command,
  type Environment,
  type Identity,
  type SchemaManifest,
  type Workspace
} from '../model.js';
import { canonical } from '../records.js';
import { parseSchemaManifest } from '../schema.js';
import { authorize, editTask, taskFor } from './access.js';
import { discussionCommand, discussionPlan, notify } from './discussion.js';
import { governanceCommand, governancePlan } from './governance.js';
import { membershipCommand } from './membership.js';
import { noEffects, noFacts, type Effects, type Facts, type Plan } from './plan.js';
import { schemaCommand, schemaPlan } from './schemas.js';
import { taskCommand, taskPlan } from './tasks.js';

/**
 * 新建工作区的初始状态，仅由可信服务端部署命令调用，普通会话没有初始化入口。
 * 同时登记 `schema` 作为第一个数据模式版本（清单重新解析一遍，只保留已知键），工作区的数据模式版本取清单的版本号。
 * 团队与应用标识不能含冒号：私有频道名 `collab:<团队>:<应用>` 以冒号分隔，含冒号会让两个工作区共用一个频道。
 */
export function bootstrap(
  input: {
    teamId: string;
    appId: string;
    name: string;
    bootstrapKey: string;
    admin: Identity;
    schema: SchemaManifest;
  },
  env: Environment
): Workspace {
  demand(input.admin.verified, 'forbidden', '初始管理员必须有已验证邮箱');
  demand(!input.teamId.includes(':') && !input.appId.includes(':'), 'invalid', '团队与应用标识不能包含冒号');
  const schema = parseSchemaManifest(input.schema);
  return {
    teamId: input.teamId,
    appId: input.appId,
    name: input.name,
    bootstrapKey: input.bootstrapKey,
    initialAdminId: input.admin.id,
    schemaVersion: schema.schemaVersion,
    schema,
    revision: 0,
    head: null,
    policy: { version: 1, stages: [{ id: 'review', name: '审核', minimum: 1, reviewers: [], after: [] }] },
    members: { [input.admin.id]: { ...input.admin, permissions: [...permissions], generation: 1, active: true } },
    tasks: {},
    prs: {},
    candidates: {},
    invitations: {},
    reviews: [],
    threads: {},
    notifications: [],
    receipts: {},
    audit: [
      {
        id: env.id(),
        actorId: input.admin.id,
        action: 'bootstrap',
        operationId: input.bootstrapKey,
        at: env.now,
        details: { initialAdminId: input.admin.id }
      }
    ]
  };
}

/** 命令的执行结果：返回给调用方的 `result`，以及除工作区状态变化之外要落到存储的 `effects`（新提交、共享记录改动、合并变更日志）。 */
export interface Outcome {
  result: Record<string, unknown>;
  effects: Effects;
}
/** 部署入口注入引擎的扩展：`checks` 是特殊业务检查（见 `checks.ts` 的 {@link RecordCheck}），默认没有。 */
export interface EngineOptions {
  checks?: RecordCheck;
}

/**
 * 命令需要预加载哪些提交与记录数据：先做与 {@link execute} 相同的授权与状态校验，通过后按命令类型声明所需数据。
 * 已有回执的重试不需要任何数据；校验不通过时抛出与 {@link execute} 相同的错误，不会白白读取数据。
 */
export function plan(state: Workspace, user: Identity, command: Command): Plan {
  demand(user.verified, 'forbidden', '需要已验证的用户身份');
  if (command.type !== 'accept_invite') authorize(state, user, 'read');
  if (state.receipts[command.operationId]) return { type: 'none' };
  return (
    taskPlan(state, user, command) ??
    governancePlan(state, user, command) ??
    schemaPlan(state, user, command) ??
    discussionPlan(state, user, command) ?? { type: 'none' }
  );
}

/**
 * 在副本上执行；任一步拒绝均保持输入状态原样。持久化层负责事务锁与原子提交，并把返回的 `effects` 写入存储。
 * `facts` 是仓储按 {@link plan} 预加载的数据，引擎只读它；不需要数据的命令可以省略。
 * `options` 是部署入口注入的扩展（特殊业务检查），默认没有。
 */
export function execute(
  state: Workspace,
  user: Identity,
  command: Command,
  env: Environment,
  facts: Facts = noFacts,
  options: EngineOptions = {}
): Outcome {
  demand(user.verified, 'forbidden', '需要已验证的用户身份');
  const effects = noEffects();
  const run = { facts, effects, checks: options.checks };
  if (command.type !== 'accept_invite') authorize(state, user, 'read');
  const previous = state.receipts[command.operationId];
  if (previous) return { result: receipt(state, user, command, previous), effects };
  const next = structuredClone(state);
  const result =
    membershipCommand(next, user, command, env) ??
    taskCommand(next, user, command, env, run) ??
    governanceCommand(next, user, command, env, run) ??
    schemaCommand(next, user, command, run) ??
    discussionCommand(next, user, command, env, run);
  demand(result, 'invalid', '不支持的操作');
  if (command.type === 'review' || command.type === 'merge' || command.type === 'pr_state')
    notify(next, user.id, command.prId, null, [], env);
  next.audit.push({
    id: env.id(),
    actorId: user.id,
    action: command.type,
    operationId: command.operationId,
    at: env.now,
    details: auditDetails(command, result)
  });
  next.receipts[command.operationId] = {
    operationId: command.operationId,
    actorId: user.id,
    fingerprint: requestFingerprint(command),
    value: structuredClone(result),
    at: env.now
  };
  next.revision++;
  Object.assign(state, next);
  return { result: structuredClone(result), effects };
}
function receipt(state: Workspace, user: Identity, command: Command, previous: Workspace['receipts'][string]) {
  authorize(state, user, 'read');
  demand(
    previous.actorId === user.id && previous.fingerprint === requestFingerprint(command),
    'idempotency',
    '幂等键已绑定其他请求或参数'
  );
  if (command.type === 'upload' || command.type === 'fork') editTask(state, user, taskFor(state, command.taskId));
  return structuredClone(previous.value);
}
/**
 * 请求指纹：回执用它拒绝「换参数复用同一幂等键」。上传与分叉的提交内容可能很大，且每个提交已带核验过的内容指纹，
 * 所以只取提交 ID 与指纹，回执体积不随提交内容增长；其余命令用规范化后的整个命令。
 */
function requestFingerprint(command: Command): string {
  if (command.type !== 'upload' && command.type !== 'fork') return canonical(command);
  return canonical({ ...command, commits: command.commits.map(({ id, fingerprint }) => ({ id, fingerprint })) });
}
/**
 * 审计详情会随摘要与审计分页发给所有可读成员，并写入成员可读的 admin_audit，因此不收录：
 * 邀请令牌摘要（tokenHash）、受邀邮箱（email，只有管理者能经摘要的 invitations 查看）、完整提交内容（commits）、
 * 数据模式清单全文（schema，结果里的 schemaVersion 足以定位，清单经只读接口按版本读取）。
 * 各命令的 result 本身不含邮箱，原样保留；合并改动的记录前后值不在 result 里，只由变更表（admin_changes）承载，
 * 审计因此不随单次合并的改动量增长。
 */
const auditExcluded = ['tokenHash', 'email', 'commits', 'schema'];
function auditDetails(command: Command, result: Record<string, unknown>): Record<string, unknown> {
  const details: Record<string, unknown> = { ...command, result };
  for (const key of auditExcluded) delete details[key];
  return details;
}

const threadActions = ['thread', 'reply', 'resolve_thread', 'edit_comment'];
const text = (value: unknown) => (typeof value === 'string' ? value : null);
/**
 * 审计事件所属的讨论线程：创建、回复、编辑、解决线程的事件，线程 ID 在 `threadId`（回复等）或 `id`（创建）里；
 * 其余事件为 null。审计分页的线程筛选与仓储写入审计时登记的线程列都以它为准。
 */
export function auditThread(event: Audit): string | null {
  if (!threadActions.includes(event.action)) return null;
  return text(event.details['threadId']) ?? text(event.details['id']);
}
/**
 * 审计事件所属的 PR：带 `prId` 的命令、PR 创建本身（`id`），以及属于某个 PR 的线程上的事件（`threadPr` 给出线程所属的 PR）；
 * 与 PR 无关的事件为 null。审计分页的 PR 筛选与仓储写入审计时登记的 PR 列都以它为准。
 */
export function auditPr(event: Audit, threadPr: (threadId: string) => string | undefined): string | null {
  const prId = text(event.details['prId']);
  if (prId !== null) return prId;
  if (event.action === 'pr') return text(event.details['id']);
  const threadId = text(event.details['threadId']);
  return threadId === null ? null : (threadPr(threadId) ?? null);
}
