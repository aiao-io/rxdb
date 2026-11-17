import { demand, type Commit } from './model.js';
import { canonical } from './records.js';

/** 参与指纹计算的提交内容：父提交、作者、说明与字段级变更；提交 ID、合并关联不在其中。 */
type Fingerprinted = Pick<Commit, 'parent' | 'authorId' | 'message' | 'changes'>;

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * 提交内容指纹：对规范化（键排序）后的 `parent`、`authorId`、`message`、`changes` 计算 SHA-256，返回 64 位十六进制。
 * 使用 `crypto.subtle`，浏览器、Node 与 Deno 通用；客户端上传时计算，服务端重新计算并比对。
 */
export async function commitFingerprint(commit: Fingerprinted): Promise<string> {
  const { parent, authorId, message, changes } = commit;
  const bytes = new TextEncoder().encode(canonical({ parent, authorId, message, changes }));
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

/** 给还没有指纹的提交补上指纹。 */
export async function sealCommit(commit: Omit<Commit, 'fingerprint'>): Promise<Commit> {
  return { ...commit, fingerprint: await commitFingerprint(commit) };
}

/** 核对每个提交声明的指纹与按其内容重新计算的结果一致；任一不一致即抛出 `invalid`，整批拒绝。 */
export async function assertFingerprints(commits: readonly Commit[]): Promise<void> {
  const computed = await Promise.all(commits.map(commit => commitFingerprint(commit)));
  demand(
    computed.every((fingerprint, index) => fingerprint === commits[index].fingerprint),
    'invalid',
    '提交指纹与内容不一致'
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
