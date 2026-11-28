// 把协作命令入口打成 Supabase Edge Function 用的自包含 ESM 产物（ADMIN-US-220）：
// 入口 src/server/edge.ts，连同处理函数、领域引擎、仓储、所需的 @aiao/rxdb 与 pg，输出到
// rxdb-admin-template/supabase/functions/admin-collaboration/dist/collaboration.js，函数的 index.ts 只导入它。
// - 不读 tsconfig（tsconfigRaw 为空）：tsconfig 的 paths 会把 @aiao/rxdb 指到源码，这里与 Node 入口一样解析到包的 dist；
// - 产物运行在 Edge Runtime（Deno）上：pg 用到的 require、Buffer、process、setImmediate、global 由 banner、inject 与 define 补上，
//   都取自 node 兼容模块，Node 与 Deno 跑同一份产物（集成测试里两种运行时各跑一遍契约测试）；
// - pg 的两个可选依赖只在 pg.native 与 Cloudflare Workers 下加载，不打进产物；
// - 目标 ES2022：Edge Runtime v1.74 内置的 V8 是 11.6。
// 产物不进仓库：随时可由本脚本重现，部署与本地起函数的 Nx 目标都先依赖构建。
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, '../src/server/edge.ts');
export const edgeBundle = path.join(here, '../../../supabase/functions/admin-collaboration/dist/collaboration.js');

await mkdir(path.dirname(edgeBundle), { recursive: true });
const result = await build({
  entryPoints: [entry],
  outfile: edgeBundle,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  tsconfigRaw: {},
  external: ['pg-native', 'pg-cloudflare'],
  define: { global: 'globalThis' },
  inject: [path.join(here, 'edge-globals.mjs')],
  banner: {
    js: "import { createRequire as __collaborationRequire } from 'node:module';\nconst require = __collaborationRequire(import.meta.url);"
  },
  minify: true,
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning'
});
const bytes = Object.values(result.metafile.outputs).reduce((total, output) => total + output.bytes, 0);
console.info(
  `Edge bundle: ${path.relative(process.cwd(), edgeBundle)} (${(bytes / 1024).toFixed(0)} KiB, ` +
    `${Object.keys(result.metafile.inputs).length} modules)`
);
