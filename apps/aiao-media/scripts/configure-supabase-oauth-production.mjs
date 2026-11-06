import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

const placeholder = value => !value || /^(replace|your_|你的|<)/i.test(value);
const unusable = value => placeholder(value) || /\s/.test(value);

/**
 * 给线上 Worker 一次写入 Supabase OAuth 的三项 secret：Client ID / Client Secret 来自环境变量或终端输入，
 * cookie 密钥随机生成。三项经 `wrangler secret bulk` 的标准输入写入同一个新版本，凭据不落盘、不进命令行参数，
 * 日志只列名称。回调地址取自 deploy/wrangler.json，必须与 Supabase OAuth App 登记的一致。
 */
export async function configureSupabaseOAuthProduction({
  application = resolve(import.meta.dirname, '..'),
  env = process.env,
  ask,
  run,
  dryRun = false,
  random = () => randomBytes(32).toString('hex'),
  log = console.log
}) {
  const config = JSON.parse(await readFile(resolve(application, 'deploy/wrangler.json'), 'utf8'));
  const redirectUri = config.vars?.SUPABASE_OAUTH_REDIRECT_URI;
  if (placeholder(redirectUri))
    throw new Error('deploy/wrangler.json 缺少 SUPABASE_OAUTH_REDIRECT_URI；未写入任何 secret。');
  const clientId = (env.SUPABASE_OAUTH_CLIENT_ID || (await ask('Supabase OAuth Client ID: '))).trim();
  const clientSecret = (
    env.SUPABASE_OAUTH_CLIENT_SECRET || (await ask('Supabase OAuth Client Secret（输入不回显）: ', { hidden: true }))
  ).trim();
  if (unusable(clientId)) throw new Error('Client ID 缺失、是占位内容或含空白；未写入任何 secret。');
  if (unusable(clientSecret)) throw new Error('Client Secret 缺失、是占位内容或含空白；未写入任何 secret。');
  const cookieSecret = random();
  if (typeof cookieSecret !== 'string' || cookieSecret.length < 32)
    throw new Error('cookie 密钥至少 32 个字符；未写入任何 secret。');
  const secrets = {
    SUPABASE_OAUTH_CLIENT_ID: clientId,
    SUPABASE_OAUTH_CLIENT_SECRET: clientSecret,
    SUPABASE_OAUTH_COOKIE_SECRET: cookieSecret
  };
  const names = Object.keys(secrets).join('、');
  if (dryRun) {
    log(`预演：将向 Worker ${config.name} 写入 ${names}；没有调用 wrangler。`);
    return;
  }
  await run(config.name, JSON.stringify(secrets));
  log(`已写入 Worker ${config.name} 的 secrets：${names}（未输出任何值）。`);
  log(`Supabase OAuth App 登记的回调必须是：${redirectUri}`);
  log(
    `部署包含 supabase-autoinit.sql 的构建后核对：GET ${new URL(redirectUri).origin}/api/supabase/oauth/status 应返回 {"available":true}。`
  );
}

/** 终端提问；hidden 时不回显，Client Secret 不会留在屏幕和滚动缓冲里。同一个 readline 贯穿全程，管道输入的多行也不会丢。 */
function createPrompter() {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stderr.write(chunk);
      done();
    }
  });
  const reader = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
  const lines = reader[Symbol.asyncIterator]();
  return {
    async ask(question, { hidden = false } = {}) {
      process.stderr.write(question);
      muted = hidden;
      const { value } = await lines.next();
      muted = false;
      if (hidden) process.stderr.write('\n');
      return value ?? '';
    },
    close: () => reader.close()
  };
}

/** 经标准输入把 JSON 交给 wrangler，凭据不出现在进程参数里；退出码非 0 就抛出。 */
function wranglerSecretBulk(name, json) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn('pnpm', ['exec', 'wrangler', 'secret', 'bulk', '--name', name], {
      cwd: resolve(import.meta.dirname, '..'),
      stdio: ['pipe', 'inherit', 'inherit']
    });
    child.on('error', rejectRun);
    child.on('exit', code =>
      code === 0 ? resolveRun() : rejectRun(new Error(`wrangler secret bulk 退出码 ${code ?? '未知'}`))
    );
    child.stdin.on('error', () => undefined);
    child.stdin.end(json);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run')) throw new Error('Only --dry-run is supported');
  const prompter = createPrompter();
  try {
    await configureSupabaseOAuthProduction({ ask: prompter.ask, run: wranglerSecretBulk, dryRun: args.length > 0 });
  } finally {
    prompter.close();
  }
}
