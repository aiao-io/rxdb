/**
 * scripts/check-workspace.mjs
 *
 * install 后兜底（package.json#postinstall -> `pnpm check-workspace`）：
 *   1. 复制 `.env.example` → `.env`（仓库根 + docker/），首次克隆免去手动配置；
 *   2. 删掉 workspace 成员 `node_modules/.bin` 里指向已不存在 store 目录的陈旧 shim；
 *   3. 用 `nx run-many --target=build --no-cloud` 预构建 workspace.mjs#NEED_BUILDS，
 *      关掉 daemon / Cloud；图损坏时 `nx reset` 后再试一次。
 *
 * CI 模式下整体跳过 —— 流水线环境里 .env 由部署系统注入、预构建由专用 job 完成。
 */

import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ora from 'ora';
import { run } from './runner.mjs';
import { NEED_BUILDS } from './workspace.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const THIS_FILE = fileURLToPath(import.meta.url);

/**
 * postinstall 里关掉 daemon 和 Cloud：
 * 陈旧 daemon / 隔离 worker 会在 Unix socket 连上前以 exit 0 退出，
 * 把 project graph 打死；Cloud org 当前 401，装依赖不该依赖远程缓存。
 */
export const POSTINSTALL_NX_ENV = {
  NX_DAEMON: 'false',
  NX_NO_CLOUD: 'true'
};

/**
 * 需要初始化的 .env 配置
 * [目标 .env 路径, 源 .env.example 路径]
 */
const ENV_CONFIGS = [
  [join(ROOT_DIR, '.env'), join(ROOT_DIR, '.env.example')],
  [join(ROOT_DIR, 'docker', '.env'), join(ROOT_DIR, 'docker', '.env.example')]
];

/**
 * 检查并初始化 .env 配置文件
 * 如果 .env 不存在但 .env.example 存在，则复制
 */
const checkEnvFiles = () => {
  const check = ora('检查 .env 配置').start();
  const initialized = [];

  for (const [envPath, examplePath] of ENV_CONFIGS) {
    if (!existsSync(envPath) && existsSync(examplePath)) {
      copyFileSync(examplePath, envPath);
      initialized.push(envPath.replace(ROOT_DIR, '.'));
    }
  }

  if (initialized.length > 0) {
    check.succeed(`初始化 .env: ${initialized.join(', ')}`);
  } else {
    check.succeed('.env 配置已就绪');
  }
};

/**
 * workspace 成员目录（对应 pnpm-workspace.yaml 的 packages 列表；modules/ 多扫几个没有 node_modules 的目录无害）。
 */
const listMemberDirs = rootDir => [
  ...['packages', 'apps', 'modules'].flatMap(group => {
    const groupDir = join(rootDir, group);
    if (!existsSync(groupDir)) return [];
    return readdirSync(groupDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(groupDir, entry.name));
  }),
  join(rootDir, 'website'),
  join(rootDir, 'benchmarks')
];

const STORE_DIR_PATTERN = /node_modules[\\/]\.pnpm[\\/]([^\\/:;"]+)/g;

/**
 * 删除 workspace 成员 `node_modules/.bin` 里引用了已不存在 `node_modules/.pnpm/<dir>` 的 shim。
 *
 * pnpm 只重写当前直接依赖的 shim，不清理已不再是直接依赖的旧 shim。store 目录 hash 一变
 * （如 @types/node 升 patch 让 vite 的目录名跟着变），这些 shim 就指向空路径，
 * 而 nx 在包目录里跑 `vite build` 时包内 .bin 排在根 .bin 之前，直接 MODULE_NOT_FOUND。
 * 只按「引用的 store 目录是否还在」判断，sh / .cmd / .ps1 三种 shim 格式通用；
 * 被删的 shim 本来就跑不起来，删掉不会让任何命令从能跑变成不能跑。
 *
 * @param {{ rootDir?: string, memberDirs?: string[] }} [options]
 * @returns {string[]} 被删除的 shim 路径
 */
export const pruneDanglingBinShims = ({ rootDir = ROOT_DIR, memberDirs = listMemberDirs(rootDir) } = {}) => {
  const storeRoot = join(rootDir, 'node_modules', '.pnpm');
  const binDirs = memberDirs.map(dir => join(dir, 'node_modules', '.bin')).filter(dir => existsSync(dir));
  const shims = binDirs.flatMap(binDir =>
    readdirSync(binDir, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => join(binDir, entry.name))
  );
  const dangling = shims.filter(shim =>
    [...readFileSync(shim, 'utf8').matchAll(STORE_DIR_PATTERN)].some(
      ([, storeDir]) => !existsSync(join(storeRoot, storeDir))
    )
  );
  dangling.forEach(shim => rmSync(shim));
  return dangling;
};

const checkBinShims = () => {
  const check = ora('清理陈旧 .bin shim').start();
  const removed = pruneDanglingBinShims();
  if (removed.length > 0) {
    check.succeed(`删除 ${removed.length} 个陈旧 shim: ${removed.map(shim => shim.replace(ROOT_DIR, '.')).join(', ')}`);
  } else {
    check.succeed('.bin shim 均有效');
  }
};

/**
 * 探测 project graph 还读不读得出来。
 *
 * `run` 是 stdio: 'inherit'，拿不到子进程输出，所以没法从报错文本里判断失败原因。
 * 换个思路：直接问「reset 要治的那个病还在不在」—— `nx show projects` 读一次图，
 * 图损坏 / daemon 挂了它必然失败，图正常它秒回。
 */
const canReadProjectGraph = async (runCommand, options) => {
  try {
    await runCommand('pnpm', ['nx show projects --json'], options);
    return true;
  } catch {
    return false;
  }
};

/**
 * 预构建 NEED_BUILDS。**仅在 project graph 损坏时** `nx reset` 后再试一次。
 *
 * 早先这里是无条件 catch 重试：一个 TS 编译错误也会触发 `nx reset`，把全仓 Nx
 * 缓存清空、再原样失败一遍 —— postinstall 时间翻倍，缓存归零，真正的编译错误
 * 还被第二轮输出冲到屏幕外。现在先探图再决定，编译错误直接原样抛出。
 *
 * @param {{ projects?: string[], runCommand?: (command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => Promise<unknown> }} [options]
 */
export const buildNeedLibs = async ({
  projects = NEED_BUILDS,
  runCommand = (command, args, options) => run(command, args, false, options)
} = {}) => {
  if (projects.length === 0) return;

  const buildArgs = [`nx run-many --target=build --projects=${projects.join(',')} --no-cloud`];
  const options = { env: POSTINSTALL_NX_ENV };
  try {
    await runCommand('pnpm', buildArgs, options);
  } catch (buildError) {
    if (await canReadProjectGraph(runCommand, options)) throw buildError;
    await runCommand('pnpm', ['nx reset'], options);
    await runCommand('pnpm', buildArgs, options);
  }
};

/**
 * 检查基础 lib 是否已经构建
 */
const checkLibBuild = async () => {
  const check = ora('build').start();
  try {
    await buildNeedLibs();
    check.succeed();
  } catch (error) {
    check.fail();
    throw error;
  }
};

// CI 下整体跳过：.env 由部署系统注入，dist 预构建由专用 job 完成。
if (process.env.CI !== 'true' && process.argv[1] === THIS_FILE) {
  checkEnvFiles();
  checkBinShims();
  await checkLibBuild();
}

/**
 * 调用方式：node scripts/check-workspace.mjs
 * 一般由 postinstall 钩子拉起，无需手动调用。
 */
