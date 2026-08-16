#!/usr/bin/env node
/**
 * 整站构建：核心库 → 三框架演示 → benchmarks → API 文档 → Docusaurus。
 *
 * @remarks
 * 所有路径都相对 {@link repoRoot} 解析、所有子命令都以它为 cwd，因此本脚本从任何目录
 * 调用都成立。website 的其余 target 都带 `cwd: "website"`，只有 build 不带——靠调用方
 * 的工作目录来对齐一堆相对路径，是一次配置改动就会崩的约定。
 *
 * @module build-website
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 仓库根目录；本文件位于 `<root>/website/scripts/`。 */
export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * `packages/` 下所有 Nx 项目的目录名。
 *
 * @remarks
 * 判据是「目录里有 `project.json`」而不是「凡目录皆算」：`packages/` 里将来多一个
 * fixtures 或 docs 目录时，前者只是不构建它，后者会把一个不存在的项目名交给
 * `nx run-many`，整场构建在第一步就挂。用 `project.json` 存在与否代替 `statSync`
 * 判目录，顺带对符号链接也成立——文件里装不下 `project.json`。
 *
 * @returns 已排序的项目名数组
 */
export function getPackageNames() {
  const packagesDir = join(repoRoot, 'packages');
  return readdirSync(packagesDir)
    .filter(name => existsSync(join(packagesDir, name, 'project.json')))
    .sort();
}

/** 构建步骤，按依赖顺序排列；`postBuild` 在对应命令成功后执行。 */
export const steps = [
  {
    name: '构建核心库',
    command: `pnpm nx run-many -t build -p ${getPackageNames().join(' ')}`
  },
  {
    name: '构建 React 演示',
    command: 'pnpm exec vite build apps/dev-rxdb-react --base=/demo/react/ --outDir=../../website/public/demo/react'
  },
  {
    name: '构建 Vue 演示',
    command: 'pnpm exec vite build apps/dev-rxdb-vue --base=/demo/vue/ --outDir=../../website/public/demo/vue'
  },
  {
    name: '构建 Angular 演示',
    // production,website：保留 production 的 hashing / SW，同时把产物写到独立目录。
    // 绝不能写回 dist/apps/dev-rxdb-angular——那是 Angular e2e 的 webServer 根。
    // 共用这份 dist 时，<base href="/demo/angular/"> 会让 localhost:8200 上整套 e2e 全红。
    command: 'pnpm nx build dev-rxdb-angular --configuration=production,website',
    postBuild: () => {
      const targetDir = join(repoRoot, 'website/public/demo/angular');
      console.log('  → 清理 website/public/demo/angular');
      rmSync(targetDir, { recursive: true, force: true });
      console.log('  → 复制 Angular 构建到 website/public/demo/angular');
      // 用 cpSync 而不是 shell 的 `cp -r`：少一次 shell 往返，且不把整个脚本绑死在 Unix 上。
      cpSync(join(repoRoot, 'dist/apps/dev-rxdb-angular-website/browser'), targetDir, { recursive: true });
    }
  },
  {
    name: '构建 Benchmarks 页面',
    command: 'pnpm nx build-website benchmarks',
    postBuild: () => {
      // 只清理 build 输出目录里可能遗留的旧产物；public/ 下的源文件要留给 Docusaurus 处理。
      for (const stale of ['website/build/benchmarks-app', 'website/build/benchmarks.html']) {
        const target = join(repoRoot, stale);
        if (!existsSync(target)) continue;
        console.log(`  → 清理旧产物 ${stale}`);
        rmSync(target, { recursive: true, force: true });
      }
    }
  },
  {
    name: '生成 API 文档',
    command: 'pnpm nx api-docs website'
  },
  {
    name: '构建 Docusaurus 网站',
    command: 'pnpm nx site-build website'
  }
];

/**
 * 顺序执行 {@link steps}，任一步失败即退出。
 *
 * @remarks
 * 退出码透传子进程的 status 而非一律 `1`：CI 上区分「构建失败」和「被 OOM killer 干掉」
 * 全靠这个码。
 */
function runSteps() {
  console.log('🚀 开始构建网站...\n');
  for (const step of steps) {
    const startedAt = performance.now();
    console.log(`▶ ${step.name}`);
    try {
      execSync(step.command, { stdio: 'inherit', cwd: repoRoot });
      step.postBuild?.();
    } catch (error) {
      console.error(`❌ ${step.name} 失败`);
      // execSync 失败时 stdio:'inherit' 已经把子进程的报错打全了，再打一遍 JS 错误只是噪音；
      // 但 postBuild 抛出时没有子进程输出，不打就彻底无痕——原来的裸 catch 丢的正是这类错误。
      const childStatus = Number.isInteger(error?.status) ? error.status : undefined;
      if (childStatus === undefined) console.error(error);
      process.exit(childStatus || 1);
    }
    console.log(`✅ ${step.name} 完成（${((performance.now() - startedAt) / 1000).toFixed(1)}s）\n`);
  }
  console.log('🎉 网站构建成功！');
}

// 只在被直接执行时构建。少了这道守卫，任何 import（包括测试）都会同步跑完整场构建。
if (import.meta.main) runSteps();
