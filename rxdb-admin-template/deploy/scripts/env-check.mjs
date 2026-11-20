/**
 * 密钥与部署环境核对（ADMIN-US-217 AC#3），Nx 目标 `rxdb-admin-template:env-check`，对本地预演栈当前在线的发布执行：
 *
 * 1. 部署出去的三端产物（`current` 指向的发布）：用 `scripts/check-secrets.mjs` 的产物规则扫（服务端角色 JWT、`sb_secret_`、
 *    带口令的连接串、PEM 私钥、服务端变量名），再逐字节搜 `.env.local` 里每一个密钥的原值；函数产物也搜原值（它是服务端代码，
 *    可以出现变量名，但不能把任何密钥打进产物）；
 * 2. 产品根里会被提交的文件（已跟踪的加上未忽略的新文件）：值规则 + 密钥原值；
 * 3. 部署环境：逐个容器读环境变量（docker inspect），确认服务端密钥只出现在需要它的服务端容器里、函数容器的连接串与密钥都来自
 *    `.env.local`，静态站点容器没有任何密钥；三端经 `/collaboration-api/config` 下发的只有公开地址与 anon key；
 * 4. `.env.local` 权限为 600、被 git 忽略且未被跟踪。
 * 报告只写变量名、文件与规则，不写任何密钥的值。结果写到 `.state/acceptance/env-check-<时刻>.json`。
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scanArtifacts, scanFiles } from '../../scripts/check-secrets.mjs';
import { loadEnv, secretNames } from './lib/env.mjs';
import {
  composeProject,
  envFile,
  frameworks,
  local,
  productRoot,
  releasesRoot,
  siteRoot,
  stateRoot
} from './lib/paths.mjs';
import { request, run } from './lib/process.mjs';
import { linkedRelease } from './lib/releases.mjs';

/** 公开值：anon key 本来就下发给浏览器，不算密钥。 */
const publicNames = ['ANON_KEY'];
/** 各容器应当拿到的密钥（变量名 → 取值来源）；其余容器一个都不该有。 */
const expected = {
  // 函数：专用角色口令（ADMIN_DATABASE_URL），以及托管平台照例注入、函数从不读取的 service role key 与 postgres 连接串
  functions: ['ADMIN_SERVICE_PASSWORD', 'SERVICE_ROLE_KEY', 'POSTGRES_PASSWORD'],
  db: ['POSTGRES_PASSWORD', 'JWT_SECRET', 'JWT_SECRET#jwk'],
  auth: ['POSTGRES_PASSWORD', 'JWT_SECRET', 'JWT_SECRET#jwk', 'JWT_KEYS', 'JWT_KEYS#d'],
  rest: ['POSTGRES_PASSWORD', 'JWT_JWKS', 'JWT_SECRET#jwk'],
  realtime: ['POSTGRES_PASSWORD', 'JWT_SECRET', 'JWT_SECRET#jwk', 'JWT_JWKS', 'REALTIME_DB_ENC_KEY', 'SECRET_KEY_BASE'],
  pooler: [],
  kong: [],
  web: [],
  mail: [],
  collector: []
};

/**
 * 密钥的原值，另加两种派生形态：ES256 私钥分量（`JWT_KEYS#d`，只该在 Auth 里）与 JWK 编码的 HS256 共享密钥
 * （`JWT_SECRET#jwk`，Auth、PostgREST、Realtime 校验 API key 用），逐字节搜索用。
 */
function secretValues(env) {
  const values = new Map();
  for (const name of secretNames.filter(name => !publicNames.includes(name))) values.set(name, env[name]);
  values.set('JWT_KEYS#d', JSON.parse(env.JWT_KEYS).find(key => key.d).d);
  values.set('JWT_SECRET#jwk', Buffer.from(env.JWT_SECRET, 'utf8').toString('base64url'));
  return values;
}
async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  return entries.filter(entry => entry.isFile()).map(entry => path.join(entry.parentPath, entry.name));
}
/** 在一组文件里逐字节找密钥原值；返回「文件 → 命中的变量名」。 */
async function findValues(files, values) {
  const hits = [];
  for (const file of files) {
    const content = await readFile(file).catch(() => undefined);
    if (!content) continue;
    for (const [name, value] of values) if (value.length >= 8 && content.includes(value)) hits.push({ file, name });
  }
  return hits;
}
/** 产品根里会被提交的文件：已跟踪的加上未忽略的新文件。 */
async function committableFiles() {
  const output = await run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: productRoot,
    capture: true
  });
  const files = output
    .split('\0')
    .filter(Boolean)
    .map(file => path.join(productRoot, file));
  const existing = [];
  for (const file of files) if ((await stat(file).catch(() => undefined))?.isFile()) existing.push(file);
  return existing;
}
/** 每个容器的环境变量（名 → 值）。 */
async function containerEnv(service) {
  const output = await run(
    'docker',
    ['inspect', `${composeProject}-${service}-1`, '--format', '{{json .Config.Env}}'],
    { capture: true, quiet: true }
  );
  return Object.fromEntries(
    JSON.parse(output).map(entry => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)])
  );
}

async function main() {
  const env = await loadEnv();
  const values = secretValues(env);
  const release = await linkedRelease(siteRoot, 'current');
  if (!release) throw new Error('还没有在线的发布：先 deploy-local');
  const web = frameworks.map(name => path.join(releasesRoot, release, 'web', name));
  const problems = [];
  const relative = file => path.relative(productRoot, file);

  const artifactFindings = await scanArtifacts(web);
  for (const finding of artifactFindings)
    problems.push(`前端产物 ${relative(finding.file)}:${finding.line} ${finding.rule}`);
  const releaseFiles = await filesUnder(path.join(releasesRoot, release));
  for (const hit of await findValues(releaseFiles, values))
    problems.push(`发布产物 ${relative(hit.file)} 含 ${hit.name} 的值`);
  const anonInArtifacts = (await findValues(releaseFiles, new Map([['ANON_KEY', env.ANON_KEY]]))).length;

  const committable = await committableFiles();
  for (const finding of await scanFiles(committable))
    problems.push(`仓库文件 ${relative(finding.file)}:${finding.line} ${finding.rule}`);
  for (const hit of await findValues(committable, values))
    problems.push(`仓库文件 ${relative(hit.file)} 含 ${hit.name} 的值`);

  const containers = {};
  for (const [service, allowed] of Object.entries(expected)) {
    const variables = await containerEnv(service);
    const present = [...values]
      .filter(([, value]) => Object.values(variables).some(item => item.includes(value)))
      .map(([name]) => name);
    const unexpected = present.filter(name => !allowed.includes(name));
    for (const name of unexpected) problems.push(`容器 ${service} 的环境里有不该有的 ${name}`);
    containers[service] = { variables: Object.keys(variables).sort(), secrets: present.sort() };
  }
  const fn = await containerEnv('functions');
  const derived = {
    ADMIN_DATABASE_URL:
      fn.ADMIN_DATABASE_URL === `postgres://admin_collaboration:${env.ADMIN_SERVICE_PASSWORD}@pooler:6432/postgres`,
    SUPABASE_ANON_KEY: fn.SUPABASE_ANON_KEY === env.ANON_KEY,
    ADMIN_JWKS_URL: fn.ADMIN_JWKS_URL === 'http://kong:8000/auth/v1/.well-known/jwks.json',
    ADMIN_JWT_ISSUER: fn.ADMIN_JWT_ISSUER === `${local.supabaseUrl}/auth/v1`,
    noSharedSecret: fn.ADMIN_JWT_SECRET === undefined
  };
  for (const [name, ok] of Object.entries(derived)) if (!ok) problems.push(`函数容器的 ${name} 不是按部署环境配置的`);

  const configs = {};
  for (const framework of frameworks) {
    const config = await (await request(`${local.web[framework]}/collaboration-api/config`)).json();
    const role = JSON.parse(
      Buffer.from(String(config.supabaseKey).split('.')[1] ?? '', 'base64url').toString() || '{}'
    ).role;
    const keys = Object.keys(config).sort();
    configs[framework] = { keys, role, supabaseUrl: config.supabaseUrl };
    if (keys.join(',') !== 'supabaseKey,supabaseUrl' || role !== 'anon')
      problems.push(`${framework} 下发的公开配置不对`);
  }

  const envStat = await stat(envFile);
  const ignored = await run('git', ['check-ignore', '-q', envFile], { quiet: true }).then(
    () => true,
    () => false
  );
  const tracked = await run('git', ['ls-files', '--error-unmatch', envFile], { capture: true, quiet: true }).then(
    () => true,
    () => false
  );
  const envFileCheck = { mode: (envStat.mode & 0o777).toString(8), ignored, tracked };
  if (envFileCheck.mode !== '600' || !ignored || tracked) problems.push('.env.local 的权限或忽略规则不对');

  const result = {
    kind: 'env-check',
    at: new Date().toISOString(),
    release,
    scanned: {
      artifactFiles: releaseFiles.length,
      committableFiles: committable.length,
      secretValues: [...values.keys()]
    },
    artifactFindings: artifactFindings.length,
    anonKeyInArtifacts: anonInArtifacts,
    containers,
    functionEnvironment: derived,
    publicConfig: configs,
    envFile: envFileCheck,
    problems
  };
  await mkdir(path.join(stateRoot, 'acceptance'), { recursive: true });
  const file = path.join(stateRoot, 'acceptance', `env-check-${result.at.replace(/[-:.]/g, '').slice(0, 15)}.json`);
  // 验收报告只写入本机私有状态目录，内容用于离线取证。
  // codeql[js/http-to-file-access]
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.info(
    `扫描：发布 ${release} 的 ${releaseFiles.length} 个产物文件、${committable.length} 个仓库文件，${values.size} 个密钥原值`
  );
  for (const [service, info] of Object.entries(containers))
    console.info(`  ${service.padEnd(9)} 密钥：${info.secrets.length ? info.secrets.join('、') : '无'}`);
  if (problems.length) {
    for (const problem of problems) console.error(`❌ ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.info(`✅ 密钥与部署环境核对通过（${path.relative(process.cwd(), file)}）`);
}

await main();
