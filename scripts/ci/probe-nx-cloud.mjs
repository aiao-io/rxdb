/**
 * scripts/ci/probe-nx-cloud.mjs
 *
 * 探测当前 workspace 的 Nx Cloud 是否能用，stdout 只写 NX_NO_CLOUD 的值。
 *
 * 为什么不能靠「有没有 token」判断：
 *   nx.json 里只要有 nxCloudId，task runner 就会去握手。FREE 套餐超额时握手
 *   返回 401「exceeding the FREE plan」，setup 的 `nx show projects` 碰不到
 *   runner，所以 setup 绿、build/lint/test 红，看起来像构建挂了。
 *
 * 探测选 GET /nx-cloud/ping + header `Nx-Cloud-Id`：
 *   不需要 access token。2xx = 可用；401 正文里的 FREE plan / 无凭据 /
 *   无效 id、超时、5xx、网络错误一律视为不可用（fail-closed）。
 *
 * 不要用这些当「可用」：
 *   is-workspace-claimed 在 org 被禁用时仍 200 true；
 *   client/verify 的 valid:false 只表示要下 bundle；
 *   heartbeat / create-run-group 禁用 org 也 200。
 *
 * 用法：
 *   node scripts/ci/probe-nx-cloud.mjs [--nx-cloud-id=...] [--api-url=https://cloud.nx.app]
 *   stdout: true | false
 *   stderr: Nx Cloud: available|unavailable — <reason>
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_API_URL = 'https://cloud.nx.app';
export const PING_PATH = '/nx-cloud/ping';
export const DEFAULT_TIMEOUT_MS = 8000;

const unavailable = reason => ({ available: false, reason, nxNoCloud: true });
const available = reason => ({ available: true, reason, nxNoCloud: false });

/**
 * 从 nx.json 文本取出 workspace id。空串 / 缺字段都当没有。
 * @param {string} nxJsonText
 * @returns {string | undefined}
 */
export function readNxCloudId(nxJsonText) {
  const parsed = JSON.parse(nxJsonText);
  return typeof parsed.nxCloudId === 'string' && parsed.nxCloudId.trim() !== ''
    ? parsed.nxCloudId.trim()
    : undefined;
}

/**
 * 只看 ping 的状态码和正文，不把「有响应」当成可用。
 * @param {{ status: number, body: string }} input
 */
export function classifyPing({ status, body }) {
  const text = body ?? '';
  if (status >= 200 && status < 300) return available(`HTTP ${status}`);
  if (text.includes('exceeding the FREE plan') || text.includes('organization has been disabled')) {
    return unavailable('organization disabled (exceeding the FREE plan)');
  }
  if (text.includes('No credentials')) return unavailable('no credentials');
  if (text.includes('Invalid Credentials')) return unavailable('invalid nxCloudId');
  return unavailable(`HTTP ${status}`);
}

const isTimeout = error => error?.name === 'AbortError' || error?.name === 'TimeoutError';

/**
 * @param {object} [options]
 * @param {string} [options.nxCloudId]
 * @param {string} [options.apiUrl]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ available: boolean, reason: string, nxNoCloud: boolean }>}
 */
export async function probeNxCloud({
  nxCloudId,
  apiUrl = DEFAULT_API_URL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof nxCloudId !== 'string' || nxCloudId.trim() === '') {
    return unavailable('missing nxCloudId');
  }

  const url = `${apiUrl.replace(/\/$/, '')}${PING_PATH}`;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { 'Nx-Cloud-Id': nxCloudId },
      signal: AbortSignal.timeout(timeoutMs)
    });
    return classifyPing({ status: response.status, body: await response.text() });
  } catch (error) {
    if (isTimeout(error)) return unavailable(`timeout after ${timeoutMs}ms`);
    return unavailable(`network: ${error?.message ?? error}`);
  }
}

/**
 * stdout 只写 true/false，给 `echo nx_no_cloud=... >> $GITHUB_OUTPUT` 直接吃。
 * 理由走 stderr，避免污染 output。
 */
export function printProbe(result, stdout, stderr) {
  const status = result.available ? 'available' : 'unavailable';
  stderr.write(`Nx Cloud: ${status} — ${result.reason}\n`);
  stdout.write(`${result.nxNoCloud ? 'true' : 'false'}\n`);
}

const readFlag = (argv, name) => {
  const hit = argv.find(arg => arg.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 3);
};

const defaultReadNxJson = () => readFileSync(resolve(process.cwd(), 'nx.json'), 'utf8');

/**
 * @param {string[]} argv
 * @param {object} [io]
 */
export async function runCli(
  argv,
  { stdout = process.stdout, stderr = process.stderr, readNxJson = defaultReadNxJson, probe = probeNxCloud } = {}
) {
  const nxCloudId = readFlag(argv, 'nx-cloud-id') ?? readNxCloudId(readNxJson());
  const apiUrl = readFlag(argv, 'api-url');
  const result = await probe({
    nxCloudId,
    ...(apiUrl === undefined ? {} : { apiUrl })
  });
  printProbe(result, stdout, stderr);
  return result;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli(process.argv.slice(2));
}
