// 本机起协作命令入口的 Edge Function（`nx run admin-collaboration:serve-edge`）：supabase/edge-runtime 容器加载
// supabase/functions/admin-collaboration（先由 build-edge 构建产物），限额与线上一致（每个请求 2 秒 CPU / 256 MB）。
// 函数的环境变量取自当前进程环境，只转交函数会读的那几个（见协作包 README 的「只部署 Supabase」）：
//   SUPABASE_URL、SUPABASE_ANON_KEY、ADMIN_PUBLIC_SUPABASE_URL、ADMIN_JWKS_URL / ADMIN_JWT_SECRET、ADMIN_JWT_ISSUER、
//   ADMIN_DATABASE_URL（协作专用数据库角色）、ADMIN_ALLOWED_ORIGINS。
// 另有两个只给本脚本的设置：EDGE_PORT（发布到 127.0.0.1 的端口，默认 54329）与 EDGE_NETWORK（要加入的 docker 网络，
// 数据库在 docker 网络里时设置）。函数地址是 http://127.0.0.1:<EDGE_PORT>/admin-collaboration；
// 开发代理用 ADMIN_API_URL=<函数地址> 即可让三端改打 Edge Function。Ctrl-C 停止并删除容器。
import { startEdgeFunction } from '../dist/server/server/edge-fixture.js';

const variables = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'ADMIN_PUBLIC_SUPABASE_URL',
  'ADMIN_JWKS_URL',
  'ADMIN_JWT_SECRET',
  'ADMIN_JWT_ISSUER',
  'ADMIN_DATABASE_URL',
  'ADMIN_ALLOWED_ORIGINS'
];
const env = Object.fromEntries(variables.filter(name => process.env[name]).map(name => [name, process.env[name]]));
const edge = await startEdgeFunction({
  env,
  port: Number(process.env['EDGE_PORT'] ?? 54329),
  network: process.env['EDGE_NETWORK'] || undefined
});
console.info(`Collaboration Edge Function ready at ${edge.url} (container ${edge.container})`);
const stop = () => {
  void edge.stop().finally(() => process.exit());
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
