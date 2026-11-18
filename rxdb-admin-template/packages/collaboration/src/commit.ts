import {
  checkCommitExchangeBatch,
  CommitExchangeJsonError,
  computeCommitExchangeRecordFingerprint,
  parseCommitExchangeRecord,
  type CommitImportBatchProblem
} from '@aiao/rxdb-plugin-working-tree/exchange';
import { CollaborationError, demand, type Commit } from './model.js';
import { assertUnits, isCommitId } from './records.js';

/** 一次上传或另存分叉最多携带的提交数。 */
export const commitBatchLimit = 100;
/**
 * 单个命令请求体的字节上限（服务端入口 `server/handler.ts` 的 `bodyLimit` 就是它），客户端据此把待上传的提交分批。
 *
 * @remarks
 * 取 4 MiB 而不是 2 MiB：提交是平台 working-tree 的交换记录，每个单元带 `unitId`、`transactionId` 与 `origin`，
 * 资产这种体量的记录改动一万条时请求约 2.3 MiB。工作树的 `commit()` 一次提交整棵工作树、客户端无法拆分，
 * 上限若装不下「单个提交最多 10000 项变更」，用户攒下的一次大改动就再也同步不上去。更宽的记录仍可能先撞到这个字节上限，
 * 两条限制各自生效、明确拒绝。
 */
export const requestBodyLimit = 4 * 1024 * 1024;

/**
 * 平台批次形状问题（`checkCommitExchangeBatch()` 的 `problem`）到协作词条的映射：父链相关的毛病说「提交父链不连续」，
 * 单元的毛病说「变更格式错误」，空批次沿用「一次同步需要 1～100 个提交」，其余都是请求字段不合法。枚举原样放进 `details`。
 */
const batchMessages: Readonly<Record<CommitImportBatchProblem, string>> = {
  empty_batch: '一次同步需要 1～100 个提交',
  invalid_commit_id: '请求字段不合法',
  duplicate_commit: '请求字段不合法',
  invalid_kind: '请求字段不合法',
  invalid_parents: '提交父链不连续',
  invalid_message: '请求字段不合法',
  invalid_author: '请求字段不合法',
  invalid_created_at: '请求字段不合法',
  invalid_units: '请求字段不合法',
  invalid_unit: '变更格式错误',
  not_topological: '提交父链不连续',
  unreachable_from_head: '提交父链不连续'
};

/** 平台的严格 JSON 解析：不合格时转成 `invalid`，只带问题枚举、位置与提交 ID（平台的错误本身就不带内容）。 */
function parseRecord(json: unknown) {
  try {
    return parseCommitExchangeRecord(json);
  } catch (error) {
    if (!(error instanceof CommitExchangeJsonError)) throw error;
    throw new CollaborationError('invalid', '请求字段不合法', {
      problem: error.problem,
      path: error.path,
      commitId: error.commitId
    });
  }
}

/**
 * `createdAt` 存进 PostgreSQL 的 timestamptz 再按 `toISOString()` 的写法读出，只有四位年份（0001～9999）能逐字往返；
 * 平台的解析还认 `+010000-…` 这类扩展年份，收下它，下发出去的串对面就解析不了，所以在这里拒绝。
 */
const storableInstant = (createdAt: string) => /^\d{4}-/.test(createdAt) && !createdAt.startsWith('0000-');
/** 协作对一条记录额外的要求：标识与作者用命令里的标识字符集，指纹是 64 位小写 hex，时间可往返，单元见 {@link assertUnits}。 */
function assertProductRules(commit: Commit): void {
  demand(
    isCommitId(commit.commitId) &&
      commit.parentIds.every(isCommitId) &&
      (commit.authorId === null || isCommitId(commit.authorId)) &&
      commit.message.length <= 10000 &&
      /^[a-f0-9]{64}$/.test(commit.contentFingerprint) &&
      storableInstant(commit.createdAt),
    'invalid',
    '请求字段不合法',
    { commitId: commit.commitId }
  );
  assertUnits(commit.units);
}

/**
 * 严格解析上传（或另存分叉）携带的一批交换记录，先后三步：
 * 1. 逐条按平台的 `parseCommitExchangeRecord()` 严格解析：多字段、缺字段、类型不对、`createdAt` 不是 `toISOString()` 的写法、
 *    补丁里有 JSON 表示不了的值，一律以 `invalid`（「请求字段不合法」）拒绝，`details` 带 `problem` / `path` / `commitId`；
 * 2. 整批交给平台的 `checkCommitExchangeBatch()`——`importCommits()` 判 `invalid_batch` 用的就是它，服务端收下的批次原样下发给
 *    别的设备时不会在形状上被拒；不合格以 `invalid` 拒绝，`details` 带 `problem` 与 `commitId`；
 * 3. 协作自己的规则：标识字符集、指纹写法、时间可往返、单元的实体与字段名、取值只能是标量（见 {@link assertUnits}）。
 * 内容指纹在授权之后由 {@link verifyFingerprints} 复算；种类、父链与作者是否合乎任务的规则由引擎裁决。
 * @returns 原样交回的线上记录（JSON 形态），不改写任何字段。
 */
export function parseCommits(input: unknown): Commit[] {
  demand(Array.isArray(input), 'invalid', '请求字段不合法');
  demand(input.length <= commitBatchLimit, 'invalid', '一次同步需要 1～100 个提交');
  const records = input.map(parseRecord);
  const finding = checkCommitExchangeBatch(records);
  if (finding)
    throw new CollaborationError('invalid', batchMessages[finding.problem], {
      problem: finding.problem,
      commitId: finding.commitId
    });
  const commits = input as Commit[];
  commits.forEach(assertProductRules);
  return commits;
}

/** 给还没有指纹的记录补上内容指纹：平台的 `computeCommitExchangeRecordFingerprint()`，提交 ID 与时间不进指纹。 */
export function withFingerprint(draft: Omit<Commit, 'contentFingerprint'>): Commit {
  return { ...draft, contentFingerprint: computeCommitExchangeRecordFingerprint(draft) };
}

/**
 * 用平台的 `computeCommitExchangeRecordFingerprint()` 逐个复算内容指纹并与声明的比对；任一不一致即以 `invalid`
 * （「提交指纹与内容不一致」）拒绝整批，`details.commitId` 指出是哪个提交。同步计算，浏览器、Node 与 Deno 通用。
 */
export function verifyFingerprints(commits: readonly Commit[]): void {
  for (const commit of commits)
    demand(
      computeCommitExchangeRecordFingerprint(commit) === commit.contentFingerprint,
      'invalid',
      '提交指纹与内容不一致',
      { commitId: commit.commitId }
    );
}

/**
 * 生成 UUIDv7 提交 ID（RFC 9562）：前 48 位是毫秒时间戳，其后为版本 7、变体位与随机位，
 * 与平台 working-tree 的提交 ID 一致，按字符串排序即按创建时间排序。
 * @param now 毫秒时间戳，默认当前时间。
 */
export function uuidv7(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Math.floor(now / 0x10000));
  view.setUint16(4, now % 0x10000);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const text = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}
