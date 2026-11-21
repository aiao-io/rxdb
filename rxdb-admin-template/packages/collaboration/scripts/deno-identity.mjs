// 在 Deno 下运行身份校验的同一组用例（ADMIN-US-220）：src/server/identity.spec.ts 原样打包（vitest 换成 scripts/deno/vitest-shim.mjs），
// 先用本机 Deno 的 `deno test` 跑一遍，再在 Supabase Edge Runtime（v1.74.0，内置 Deno 2.1.4，与 Edge Function 线上运行时同一版本）
// 的用户 worker 里跑一遍，两边都必须全部通过。Deno 可执行文件取自 DENO_BIN，未设置时用 PATH 里的 deno。
// 产物写在 test-output/deno（不进仓库）。
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { startEdgeFunction } from '../dist/server/server/edge-fixture.js';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, '..', 'test-output', 'deno');
const bundle = path.join(output, 'identity.spec.js');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  entryPoints: [path.join(here, '..', 'src', 'server', 'identity.spec.ts')],
  outfile: bundle,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  tsconfigRaw: {},
  alias: { vitest: path.join(here, 'deno', 'vitest-shim.mjs') },
  external: ['node:*'],
  // 用例自己签测试令牌时用到 Buffer：与函数产物一样从 node 兼容模块注入（Edge Runtime 的用户代码里没有这个全局变量）
  inject: [path.join(here, 'edge-globals.mjs')],
  mainFields: ['module', 'main'],
  logLevel: 'warning'
});

// 1. 本机 Deno：每个登记的用例注册成一个 Deno.test
const driver = path.join(output, 'deno.test.mjs');
await writeFile(
  driver,
  "import './identity.spec.js';\nfor (const { name, fn } of globalThis.__collaborationTests) Deno.test(name, fn);\n"
);
const deno = process.env['DENO_BIN'] || 'deno';
// 不读仓库里的任何配置（Deno 会沿目录向上找 package.json / tsconfig 并据此解析），只跑这一个自包含的产物
const local = await run(deno, ['test', '--no-config', '--quiet', driver], {
  cwd: output,
  env: { ...process.env, NO_COLOR: '1' }
}).catch(error => error);
process.stdout.write(local.stdout ?? '');
process.stderr.write(local.stderr ?? '');
if (local instanceof Error) throw new Error('identity.spec.ts failed under deno test');

// 2. Edge Runtime：一个只用来跑用例的函数，收到请求时依次执行全部用例并返回结果
const functions = path.join(output, 'functions');
const tests = path.join(functions, 'identity-tests');
await mkdir(tests, { recursive: true });
await cp(bundle, path.join(tests, 'identity.spec.js'));
await writeFile(
  path.join(tests, 'index.ts'),
  [
    "import './identity.spec.js';",
    'interface Case { name: string; fn: () => unknown }',
    'const cases = (globalThis as unknown as { __collaborationTests: Case[] }).__collaborationTests;',
    'Deno.serve(async () => {',
    '  const results: { name: string; ok: boolean; error?: string }[] = [];',
    '  for (const { name, fn } of cases) {',
    '    try { await fn(); results.push({ name, ok: true }); }',
    '    catch (error) { results.push({ name, ok: false, error: String(error) }); }',
    '  }',
    '  return Response.json({ deno: Deno.version.deno, results });',
    '});',
    ''
  ].join('\n')
);
// 生成 RSA / EC 测试密钥对与逐条验签需要几百毫秒 CPU：用例 worker 放宽 CPU 上限，限额本身由资源测量另行验证
const edge = await startEdgeFunction({
  env: {},
  functions,
  runtime: { EDGE_CPU_SOFT_LIMIT_MS: '30000', EDGE_CPU_HARD_LIMIT_MS: '60000' }
});
try {
  const response = await fetch(`${edge.origin}/identity-tests`);
  const report = await response.json();
  if (!Array.isArray(report.results))
    throw new Error(
      `Edge Runtime did not run the cases: ${response.status} ${JSON.stringify(report)}\n${await edge.logs()}`
    );
  const failed = report.results.filter(result => !result.ok);
  console.info(
    `Edge Runtime (${report.deno}): ${report.results.length - failed.length}/${report.results.length} passed`
  );
  for (const result of failed) console.error(`  ✗ ${result.name}: ${result.error}`);
  if (failed.length || !report.results.length) throw new Error('identity.spec.ts failed in Edge Runtime');
} finally {
  await edge.stop();
}
