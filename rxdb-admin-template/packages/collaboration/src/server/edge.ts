import { collaborationRuntime, edgeEntry } from './runtime.js';

/**
 * Supabase Edge Function 入口（Deno）：与 Node 入口共用同一个 fetch 风格的处理函数、领域引擎与仓储，只是环境变量名与连接池不同
 * （见 `runtime.ts` 的 `edgeEntry`）。`nx run admin-collaboration:build-edge` 用 esbuild 把它连同所需的 `@aiao/rxdb` 与 `pg`
 * 打成自包含的 ESM 产物 `supabase/functions/admin-collaboration/dist/collaboration.js`，函数目录的 `index.ts` 只导入这个产物。
 * 配置不全时模块求值即失败，平台按启动失败（503 BOOT_ERROR）回应，客户端按可重试错误处理。
 */
declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

const { handler } = collaborationRuntime(Deno.env.toObject(), edgeEntry, {
  onError: error => console.error('Collaboration function internal error:', error)
});
Deno.serve(handler);
