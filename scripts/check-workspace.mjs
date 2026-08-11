/**
 * scripts/check-workspace.mjs
 *
 * install 后兜底（package.json#postinstall -> `pnpm check-workspace`）：
 *   1. 复制 `.env.example` → `.env`（仓库根 + docker/），首次克隆免去手动配置；
 *   2. 用 `nx run-many --target=build` 预构建 workspace.mjs#NEED_BUILDS 列出的库，
 *      保证下游包 import 时 dist/ 已就绪，避免装完就跑测试时出现「找不到产物」。
 *
 * CI 模式下整体跳过 —— 流水线环境里 .env 由部署系统注入、预构建由专用 job 完成。
 */

import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ora from 'ora';
import { run } from './runner.mjs';
import { NEED_BUILDS } from './workspace.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

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
 * 检查基础 lib 是否已经构建
 */
const checkLibBuild = async () => {
  if (NEED_BUILDS.length > 0) {
    const check = ora('build').start();
    await run('pnpm', [`nx run-many --target=build --projects=${NEED_BUILDS.join(',')}`]);
    check.succeed();
  }
};

// CI 下整体跳过：.env 由部署系统注入，dist 预构建由专用 job 完成。
if (process.env.CI !== 'true') {
  checkEnvFiles();
  await checkLibBuild();
}

/**
 * 调用方式：node scripts/check-workspace.mjs
 * 一般由 postinstall 钩子拉起，无需手动调用。
 */
