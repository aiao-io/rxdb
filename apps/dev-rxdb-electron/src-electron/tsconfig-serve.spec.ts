import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface TsConfig {
  extends?: string;
  compilerOptions?: Record<string, unknown>;
}

const appDir = resolve(import.meta.dirname, '..');

function readJsonc(path: string): TsConfig {
  // tsconfig 允许行注释，JSON.parse 不认；只需剥掉整行 `//`，本仓 tsconfig 无块注释。
  const raw = readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(raw) as TsConfig;
}

const serve = readJsonc(resolve(appDir, 'tsconfig.serve.json'));
const base = readJsonc(resolve(appDir, '../../tsconfig.base.json'));

describe('ELEC-14 主进程 tsconfig 与仓库基线的关系', () => {
  it('继承仓库基线，而不是重新声明一套宽松开关', () => {
    expect(serve.extends).toBe('../../tsconfig.base.json');
  });

  it.each([
    'forceConsistentCasingInFileNames',
    'isolatedModules',
    'noFallthroughCasesInSwitch',
    'noImplicitOverride',
    'noImplicitReturns',
    'noUnusedLocals'
  ])('继承基线的 %s 而不在本地关掉它', key => {
    expect(base.compilerOptions?.[key]).toBe(true);
    // 本地要么不写（继承），要么必须同为 true；写成 false 等于把基线挖掉。
    if (key in (serve.compilerOptions ?? {})) {
      expect(serve.compilerOptions?.[key]).toBe(true);
    }
  });

  // 这条是继承基线时最容易踩的坑，也是本文件存在的主要理由。
  //
  // 基线开着 `importHelpers: true`：对 renderer 无害（bundler 会把 tslib 打进包），
  // 但主进程是**逐文件 tsc 产物、没有任何 bundle 步骤**，而
  // `electron-builder.json` 的 `files` 白名单是
  // `["!node_modules", "package.json", "src-electron/**/*.js", "src-electron/**/*.js.map"]`
  // —— 显式排除了 node_modules。
  //
  // 一旦继承基线而不关掉它，`main.js` 会 emit 出 `require("tslib")`，
  // 打包产物里却没有 tslib：应用启动即 `Cannot find module 'tslib'`。
  // 这个失败**只在真实打包后才出现**，typecheck、单测、dev 模式全是绿的。
  it('必须显式关掉 importHelpers —— 主进程不 bundle，打包产物里没有 tslib', () => {
    expect(base.compilerOptions?.['importHelpers']).toBe(true);
    expect(serve.compilerOptions?.['importHelpers']).toBe(false);
  });

  // 基线是 composite + emitDeclarationOnly（给库用的）；主进程要的是真 JS。
  it('覆盖基线的库向 emit 开关，保证产出可执行 JS', () => {
    expect(base.compilerOptions?.['emitDeclarationOnly']).toBe(true);
    expect(serve.compilerOptions?.['emitDeclarationOnly']).toBe(false);
    expect(serve.compilerOptions?.['composite']).toBe(false);
    expect(serve.compilerOptions?.['declaration']).toBe(false);
  });
});
