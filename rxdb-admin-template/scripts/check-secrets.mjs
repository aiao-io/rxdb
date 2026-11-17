/**
 * 部署前的密钥扫描（ADMIN-US-217 AC#3）。
 *
 * 两类输入用两套口径：
 *
 * - **前端构建产物**（`--artifact <dir>`）：浏览器拿到的每个字节都是公开的。服务端密钥的值不许出现，
 *   服务端才读的变量名也不许出现——变量名出现在前端包里，说明服务端模块被打进了客户端，
 *   即使这一版碰巧没带值，下一次改动就可能带上。
 * - **产品根里被 git 跟踪的文件**（`--tracked`）：代码与文档要写变量名（服务端从环境读它们），
 *   因此只查值。
 *
 * 匿名 / 可发布密钥本来就要下发给浏览器，不算违规：JWT 只在 `role` 是服务端角色时报出。
 * 报告只带文件、行号和打码后的前缀，绝不把命中的密钥原样打进 CI 日志。
 */
import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 服务端才读的变量名；出现在前端产物里即判违规。 */
export const SERVER_ONLY_VARIABLES = [
  'ADMIN_DATABASE_URL',
  'ADMIN_BOOTSTRAP_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_DB_URL',
  'SUPABASE_JWT_SECRET'
];

/** 能拿到数据库全部权限的 JWT 角色；`anon` / `authenticated` 本就公开。 */
const PRIVILEGED_ROLES = new Set(['service_role', 'supabase_admin']);

/** 文档里常见的占位写法：`[YOUR-PASSWORD]`、`<password>`、`${PASSWORD}`、`****`。 */
const PLACEHOLDER = /^(?:\[[^\]]*\]|<[^>]*>|\$\{[^}]*\}|\*+)$/;

const JWT = /\beyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g;
const SECRET_API_KEY = /\bsb_secret_[\w-]{16,}/g;
const DATABASE_URL = /\bpostgres(?:ql)?:\/\/[^\s:/@'"`]+:([^\s@'"`]+)@[^\s'"`]+/g;
const PRIVATE_KEY = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g;

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role;
  } catch {
    // 形似 JWT 但载荷不是 JSON：不是 Supabase 签发的令牌，不按密钥处理。
    return undefined;
  }
}

/** 每条规则：名称 + 在一段文本里找出命中的函数。 */
const VALUE_RULES = [
  { rule: 'service-role-jwt', find: text => [...text.matchAll(JWT)].filter(m => PRIVILEGED_ROLES.has(jwtRole(m[0]))) },
  { rule: 'secret-api-key', find: text => [...text.matchAll(SECRET_API_KEY)] },
  { rule: 'database-url', find: text => [...text.matchAll(DATABASE_URL)].filter(m => !PLACEHOLDER.test(m[1])) },
  { rule: 'private-key', find: text => [...text.matchAll(PRIVATE_KEY)] }
];

const variablePattern = new RegExp(`\\b(?:${SERVER_ONLY_VARIABLES.join('|')})\\b`, 'g');
const VARIABLE_RULE = { rule: 'server-variable', find: text => [...text.matchAll(variablePattern)] };

function lineOf(text, index) {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line += 1;
  return line;
}

function mask(value) {
  return `${value.slice(0, 6)}…（${value.length} 字符）`;
}

async function readText(file) {
  const bytes = await readFile(file);
  return bytes.includes(0) ? undefined : bytes.toString('utf8');
}

async function scanFile(file, rules) {
  const text = await readText(file);
  if (text === undefined) return [];
  return rules.flatMap(({ rule, find }) =>
    find(text).map(match => ({ file, line: lineOf(text, match.index), rule, preview: mask(match[0]) }))
  );
}

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter(entry => entry.isFile()).map(entry => path.join(entry.parentPath, entry.name));
}

async function assertDirectory(dir) {
  const info = await stat(dir).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error(`产物目录不存在：${dir}；先构建三端应用再扫描`);
}

/**
 * 扫描一组文件里的密钥值（不查变量名）。
 *
 * @param {string[]} files - 文件路径
 * @returns {Promise<Array<{file: string, line: number, rule: string, preview: string}>>} 命中项
 */
export async function scanFiles(files) {
  const groups = await Promise.all(files.map(file => scanFile(file, VALUE_RULES)));
  return groups.flat();
}

/**
 * 扫描前端构建产物目录：既查密钥值，也查服务端变量名。
 *
 * @param {string[]} dirs - 产物目录；任一不存在即抛错，不跳过
 * @returns {Promise<Array<{file: string, line: number, rule: string, preview: string}>>} 命中项
 */
export async function scanArtifacts(dirs) {
  for (const dir of dirs) await assertDirectory(dir);
  const files = (await Promise.all(dirs.map(filesUnder))).flat();
  const groups = await Promise.all(files.map(file => scanFile(file, [...VALUE_RULES, VARIABLE_RULE])));
  return groups.flat();
}

function trackedFiles(cwd) {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' });
  return output
    .split('\0')
    .filter(Boolean)
    .map(file => path.join(cwd, file));
}

function parseArgs(argv) {
  const options = { tracked: false, artifacts: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--tracked') options.tracked = true;
    else if (argv[i] === '--artifact') options.artifacts.push(argv[(i += 1)]);
    else throw new Error(`未知参数：${argv[i]}`);
  }
  if (!options.tracked && options.artifacts.length === 0) throw new Error('至少指定 --tracked 或一个 --artifact <dir>');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const findings = [
    ...(options.tracked ? await scanFiles(trackedFiles(cwd)) : []),
    ...(await scanArtifacts(options.artifacts.map(dir => path.resolve(cwd, dir))))
  ];
  for (const { file, line, rule, preview } of findings) {
    console.error(`${path.relative(cwd, file)}:${line} ${rule} ${preview}`);
  }
  if (findings.length > 0) {
    console.error(`❌ 发现 ${findings.length} 处疑似密钥`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ 密钥扫描通过（${options.tracked ? '仓库文件 + ' : ''}${options.artifacts.length} 个产物目录）`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
