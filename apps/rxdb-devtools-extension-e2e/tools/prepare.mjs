#!/usr/bin/env node
/**
 * 组装扩展 e2e 需要的两份产物：可加载的 unpacked 扩展副本，以及被检查页面的 web root。
 *
 * 为什么要复制而不是直接加载 `apps/rxdb-devtools-extension/dist`：
 * 本套件必须给测试用的 manifest 打一处 **variance** —— 把 fixture origin 写成静态
 * `host_permissions`。生产 manifest 用的是 `optional_host_permissions: ['<all_urls>']`，
 * 授权要走运行时的 Chrome 原生弹窗，而那个弹窗不属于被测能力（与阶段 A 对 AC#3 的
 * 可容忍差异同源：授权 UI 本身不是要验的东西，注入与中继才是）。直接改源 manifest
 * 会把这处放宽带进生产包，所以只改副本，并由 `manifest.config.spec.ts` 继续守住原件。
 *
 * 用法：node apps/rxdb-devtools-extension-e2e/tools/prepare.mjs
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../..');
const outRoot = join(workspaceRoot, 'dist/apps/rxdb-devtools-extension-e2e');

/**
 * fixture origin 对应的 host permission pattern。
 *
 * @remarks
 * 不带端口：Chrome 的 host pattern 里没有端口这一段，面板求出的也是
 * `http://localhost/*`（见 `inspected-page-access.service.ts` 的 `permissionPatternForUrl`）。
 * 写成 `http://localhost:8210/*` 会被 Chrome 判为非法 pattern，整个扩展加载失败。
 */
const FIXTURE_HOST_PATTERN = 'http://localhost/*';

function copyExtension() {
  const source = join(workspaceRoot, 'apps/rxdb-devtools-extension/dist');
  const target = join(outRoot, 'extension');
  cpSync(source, target, { recursive: true });

  const manifestPath = join(target, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // variance：只覆盖 fixture 自身 origin，不放宽到 `<all_urls>`；
  // `optional_host_permissions` 原样保留，好让「生产形态未被改写」在副本里也看得见。
  manifest.host_permissions = [FIXTURE_HOST_PATTERN];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function copyWebRoot() {
  const target = join(outRoot, 'web');
  mkdirSync(target, { recursive: true });
  // 页内 connector 用真实构建产物，而不是测试里 new 一个源码类：
  // e2e 要验的是「发布出去的那份 connector 能不能和扩展对上」。
  cpSync(join(workspaceRoot, 'packages/rxdb-devtools/dist'), join(target, 'vendor'), { recursive: true });
  cpSync(join(here, '../fixture'), target, { recursive: true });
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });
copyExtension();
copyWebRoot();
console.log(`prepared ${outRoot}`);
