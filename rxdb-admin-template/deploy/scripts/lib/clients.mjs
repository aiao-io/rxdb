/**
 * 验收脚本访问部署栈的客户端（ADMIN-US-217）：supabase-js、协作包的只读访问（`CollaborationReader`）与命令入口。
 * supabase-js 与平台交换格式按协作包的依赖解析，协作包的读取与领域函数取它的服务端构建产物（`admin-collaboration:build-server`）。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { collaborationRoot, local } from './paths.mjs';

const require = createRequire(path.join(collaborationRoot, 'package.json'));
const load = specifier => import(pathToFileURL(require.resolve(specifier)).href);
const dist = file => import(pathToFileURL(path.join(collaborationRoot, 'dist', 'server', file)).href);

export const { createClient } = await load('@supabase/supabase-js');
export const { computeCommitExchangeRecordFingerprint } = await load('@aiao/rxdb-plugin-working-tree/exchange');
export const { CollaborationReader } = await dist('reader.js');
export const { supabaseReadSource } = await dist('read-source.js');
export const { diffRecords } = await dist('changes.js');

const quiet = { auth: { persistSession: false, autoRefreshToken: false } };
/** service key 的客户端：只用 Auth 管理接口（建账号、签验证码），只在验收脚本里。 */
export const adminClient = secrets => createClient(local.supabaseUrl, secrets.SERVICE_ROLE_KEY, quiet);

/**
 * 以真实的验证码登录一个账号（管理接口签出验证码，再走 verifyOtp），返回已登录的客户端与 access token（部署栈按 ES256 签发）。
 * @param {Record<string, string>} secrets
 * @param {string} email
 */
export async function signIn(secrets, email) {
  const link = await adminClient(secrets).auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const client = createClient(local.supabaseUrl, secrets.ANON_KEY, quiet);
  const { data, error } = await client.auth.verifyOtp({ email, token: link.data.properties.email_otp, type: 'email' });
  if (error) throw error;
  return { client, token: data.session.access_token, userId: data.user.id };
}

/**
 * 向部署出的命令入口（经网关的函数地址）提交一条命令，返回状态、响应体与耗时（毫秒）。
 * @param {string} token
 * @param {{ teamId: string, appId: string }} workspace
 * @param {Record<string, unknown>} command 须带 operationId
 */
export async function command(token, workspace, command) {
  const started = performance.now();
  const response = await fetch(`${local.functionUrl}/workspaces/${workspace.teamId}/${workspace.appId}/commands`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(command)
  });
  const body = await response.json();
  return { status: response.status, body, ms: performance.now() - started };
}

/** 一个计数响应字节的 fetch：团队页经 PostgREST 读取时，统计浏览器实际收到的字节数。 */
export function countingFetch() {
  const stats = { requests: 0, bytes: 0 };
  const wrapped = async (input, init) => {
    const response = await fetch(input, init);
    const body = await response.arrayBuffer();
    stats.requests += 1;
    stats.bytes += body.byteLength;
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  return { fetch: wrapped, stats };
}

/** 以某个 access token 读部署栈的只读投影（与浏览器同一个 CollaborationReader 与 PostgREST 读取来源）。 */
export function readerFor(secrets, token, fetcher = fetch) {
  const client = createClient(local.supabaseUrl, secrets.ANON_KEY, {
    ...quiet,
    global: { fetch: fetcher, headers: { Authorization: `Bearer ${token}` } }
  });
  return new CollaborationReader(() => supabaseReadSource(client));
}

/**
 * 手工形成一个任务提交（平台交换记录）：唯一的父是 `parent`，单元共用提交 ID、来源 local，内容指纹由平台函数计算。
 * @param {{ id: string, parent: string, authorId: string, message: string, before: object, after: object }} input
 */
export function taskCommit(input) {
  const changes = diffRecords(input.before, input.after, () => 'assets');
  const draft = {
    commitId: input.id,
    parentIds: [input.parent],
    kind: 'normal',
    message: input.message,
    authorId: input.authorId,
    createdAt: new Date().toISOString(),
    units: changes.map(change => ({ ...change, unitId: input.id, transactionId: null, origin: 'local' }))
  };
  return { ...draft, contentFingerprint: computeCommitExchangeRecordFingerprint(draft) };
}

/** 一组耗时的统计：次数、中位数、p95 与最大值（毫秒，保留一位小数）。 */
export function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = ratio => sorted[Math.min(sorted.length - 1, Math.floor(ratio * sorted.length))];
  const round = value => Math.round(value * 10) / 10;
  return { count: sorted.length, p50: round(pick(0.5)), p95: round(pick(0.95)), max: round(sorted.at(-1)) };
}
