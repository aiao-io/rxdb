/**
 * scripts/preinstall.mjs
 *
 * 仓库的 preinstall 钩子（package.json#preinstall）。
 * 负责挡住错装 / 装错版本 / 留陈旧 Angular 子包依赖的问题。
 *
 * 检查项：
 *   1. 包管理器必须是 pnpm（拒绝 npm / yarn / bun）
 *   2. Node ≥ 26.0.0
 *   3. pnpm ≥ 10.0.0
 *   4. 清理 `packages/code-editor-angular` 与 `packages/rxdb-angular` 的 node_modules
 *      —— 这两个 Angular 包在不同运行时间之间容易形成陈旧的 pnpm link
 *
 * CI 环境（process.env.CI === 'true'）直接放行，避免拖慢流水线。
 */

if (process.env.CI) {
  process.exit(0);
}

import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { lt as semverLessThan } from 'semver';

// 通过 npm_config_user_agent 与 npm_execpath 两个环境变量识别当前调起者；
// 两个变量都拿不到时（理论上不应发生）跳过检查放行，避免误伤裸 npm exec。
const packageManagerUserAgent = process.env.npm_config_user_agent ?? '';
const packageManagerExecPath = process.env.npm_execpath ?? '';
const isPnpmExecution =
  packageManagerUserAgent.startsWith('pnpm/') ||
  packageManagerExecPath.includes('/pnpm') ||
  packageManagerExecPath.includes('\\pnpm');

if ((packageManagerUserAgent || packageManagerExecPath) && !isPnpmExecution) {
  console.error('This repository must be installed with pnpm. Please run: pnpm install');
  process.exit(1);
}

// 校验 Node 主版本：技术栈要求 ≥ 26（见 AGENTS.md 技术栈表）。
if (semverLessThan(process.version, '26.0.0')) {
  console.error(`Node ${process.version} is unsupported. Please use Node 26 or newer.`);
  process.exit(1);
}

// 校验 pnpm 版本：工作区协议 / lockfile 格式要求 ≥ 10。
try {
  const pnpmVersion = execSync('pnpm --version', {
    encoding: 'utf8'
  });
  const version = pnpmVersion.trim();
  if (semverLessThan(version, '10.0.0')) {
    console.error(
      `Found pnpm ${version}. Please make sure that your installed pnpm version is 10.0.0 or greater. You can update with: npm install -g pnpm@10`
    );
    process.exit(1);
  }
} catch {
  console.error('Could not find pnpm on this system. Please make sure it is installed with: npm install -g pnpm@10');
  process.exit(1);
}

// Angular 子包的陈旧 node_modules 容易让 ng-packagr / esbuild 在不同时间跑出不一致产物，
// 强制清理让 pnpm install 重新生成 link —— 用 rmSync 而不是 pnpm --recursive 是因为
// preinstall 阶段还未跑过 install，pnpm 自身的子包清理 API 不可用。
const packagesToClean = ['packages/code-editor-angular', 'packages/rxdb-angular'];

packagesToClean.forEach(pkg => {
  const nodeModulesPath = join(process.cwd(), pkg, 'node_modules');
  if (existsSync(nodeModulesPath)) {
    try {
      console.log(`Removing ${nodeModulesPath}...`);
      rmSync(nodeModulesPath, { recursive: true, force: true });
      console.log(`Removed ${pkg}/node_modules`);
    } catch (error) {
      console.warn(`Failed to remove ${pkg}/node_modules: ${error.message}`);
    }
  }
});
