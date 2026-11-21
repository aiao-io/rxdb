/**
 * 三端 app e2e 的模拟认证服务：全站都要登录，而这套 e2e 跑在不带协作后端的生产构建上，这里只提供登录需要的几个接口——
 * 协作命令入口的公开配置（`/collaboration-api/config`）与 Supabase Auth（GoTrue）的验证码登录、确认账号、刷新与退出，
 * 以及返回空列表的只读投影（`/rest/v1/*`，团队协作页里「可访问的团队」读到空）。验证码固定为 {@link code}。
 *
 * - React / Vue：vite preview 把 `/collaboration-api` 代理到这里（`ADMIN_API_URL`）。
 * - Angular：静态文件服务没法代理，传 `--static <产物目录>` 让本服务同时托管产物（找不到的页面回落到 index.html）。
 *
 * 只用于 e2e，不进任何构建产物；生产代码里没有任何跳过登录的开关。
 * 用法：node e2e-auth-server.mjs --port <端口> [--static <目录>]
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

/** 测试账号与它的固定验证码。 */
export const account = { id: '8d4f4c3e-5f0e-4c7e-9a62-6e2d7c1b9e01', email: 'e2e@admin-template.test' };
export const code = '000000';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json'
};
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
};
const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');

/** 一枚形似 GoTrue 签发的访问令牌（不验签，只给 supabase-js 读到期时间与主体）。 */
function token(expiresAt) {
  const claims = { sub: account.id, email: account.email, role: 'authenticated', aud: 'authenticated', exp: expiresAt };
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}.e2e`;
}
function user() {
  const now = new Date().toISOString();
  return {
    id: account.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: account.email,
    email_confirmed_at: now,
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now
  };
}
/** 一份会话：一小时后到期。 */
function session() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: token(expiresAt),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: `refresh-${expiresAt}`,
    user: user()
  };
}
function send(response, status, body) {
  response.writeHead(status, { ...cors, 'content-type': 'application/json; charset=utf-8' });
  response.end(body === undefined ? '' : JSON.stringify(body));
}
async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

/**
 * 处理一个请求：认证与配置接口返回模拟结果；托管产物时其余 GET 请求按文件返回，找不到的回落到 index.html。
 * @param {string | undefined} directory 托管的产物目录。
 */
export function handler(directory) {
  return async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    if (request.method === 'OPTIONS') return send(response, 204);
    if (url.pathname.endsWith('/collaboration-api/config'))
      return send(response, 200, { supabaseUrl: url.origin, supabaseKey: 'e2e-anon-key' });
    if (url.pathname === '/auth/v1/otp') return send(response, 200, {});
    if (url.pathname === '/auth/v1/verify') {
      const { token: given } = await body(request);
      if (given !== code)
        return send(response, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      return send(response, 200, session());
    }
    if (url.pathname === '/auth/v1/token') return send(response, 200, session());
    if (url.pathname === '/auth/v1/user') return send(response, 200, user());
    if (url.pathname === '/auth/v1/logout') return send(response, 204);
    if (url.pathname.startsWith('/rest/v1/')) return send(response, 200, []);
    if (!directory || request.method !== 'GET') return send(response, 404, { message: 'not found' });
    const file = path.join(directory, path.normalize(decodeURIComponent(url.pathname)));
    const found = file.startsWith(directory) && (await stat(file).catch(() => null))?.isFile();
    const target = found ? file : path.join(directory, 'index.html');
    response.writeHead(200, { 'content-type': types[path.extname(target)] ?? 'application/octet-stream' });
    createReadStream(target).pipe(response);
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argument = name => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const port = Number(argument('--port'));
  const directory = argument('--static');
  if (!Number.isInteger(port)) throw new Error('--port 需要一个端口号');
  createServer(handler(directory && path.resolve(directory))).listen(port, '127.0.0.1', () => {
    console.log(`e2e auth server on http://127.0.0.1:${port}${directory ? ` serving ${directory}` : ''}`);
  });
}
