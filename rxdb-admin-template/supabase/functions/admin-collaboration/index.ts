// Supabase Edge Function：团队协作的命令入口（唯一的写路径，ADMIN-US-220）。
// 处理函数、领域引擎、仓储以及所需的 @aiao/rxdb 与 pg 都在协作包里，与 Node 入口是同一份代码；
// `pnpm nx run admin-collaboration:build-edge` 用 esbuild 把它们打成自包含的 ./dist/collaboration.js（不进仓库，可重现），
// 部署与本地起函数之前都先构建。环境变量与部署步骤见 rxdb-admin-template/packages/collaboration/README.md。
import './dist/collaboration.js';
