#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 获取 packages 目录下的所有文件夹名称
 */
function getPackageNames() {
  const packagesDir = join(process.cwd(), 'packages');
  return readdirSync(packagesDir)
    .filter(item => {
      const itemPath = join(packagesDir, item);
      return statSync(itemPath).isDirectory();
    })
    .sort();
}

const steps = [
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
    command: 'pnpm nx build dev-rxdb-angular --base-href=/demo/angular/',
    postBuild: () => {
      const targetDir = 'website/public/demo/angular';
      if (existsSync(targetDir)) {
        console.log(`  → 清理 ${targetDir}`);
        rmSync(targetDir, { recursive: true, force: true });
      }
      console.log('  → 复制 Angular 构建到 website/public/demo/angular');
      execSync('cp -r dist/apps/dev-rxdb-angular/browser website/public/demo/angular', { stdio: 'inherit' });
    }
  },
  {
    name: '构建 Benchmarks 页面',
    command: 'pnpm nx build-website benchmarks',
    postBuild: () => {
      // 只清理 build 输出目录中可能遗留的旧产物，public/ 中的源文件需要保留供 Docusaurus 处理
      const staleDirs = ['website/build/benchmarks-app'];
      const staleFiles = ['website/build/benchmarks.html'];

      for (const targetDir of staleDirs) {
        if (existsSync(targetDir)) {
          console.log(`  → 清理旧产物 ${targetDir}`);
          rmSync(targetDir, { recursive: true, force: true });
        }
      }

      for (const targetFile of staleFiles) {
        if (existsSync(targetFile)) {
          console.log(`  → 清理旧产物 ${targetFile}`);
          rmSync(targetFile, { force: true });
        }
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

console.log('🚀 开始构建网站...\n');

for (const step of steps) {
  console.log(`▶ ${step.name}`);
  try {
    execSync(step.command, { stdio: 'inherit' });
    if (step.postBuild) {
      step.postBuild();
    }
    console.log(`✅ ${step.name} 完成\n`);
  } catch {
    console.error(`❌ ${step.name} 失败`);
    process.exit(1);
  }
}

console.log('🎉 网站构建成功！');

// 导出函数供测试使用
export { getPackageNames };
