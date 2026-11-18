/**
 * 本地整套开发环境（`pnpm nx dev rxdb-admin-template`）的固定入口。端口固定，被占用时直接报错，不自动换号。
 * 三端开发服务器的端口与各自的 vite 配置 / Angular project.json 一致，产品根 dev 目标的就绪地址与这里一致，由 services.spec.mjs 校验。
 * 本地 Supabase 栈与发布预演共用一套（`deploy/local/`，独占 4500～4529），地址取自 `deploy/scripts/lib/paths.mjs`。
 */
import { local, ports } from '../../deploy/scripts/lib/paths.mjs';

/** 开发服务都只监听本机回环地址。 */
export const host = '127.0.0.1';

/** 三端开发服务器：改代码热更新，`/collaboration-api` 代理到协作命令服务。 */
export const apps = [
  { id: 'react', name: 'React', project: 'rxdb-admin-template-react', port: 4206 },
  { id: 'angular', name: 'Angular', project: 'rxdb-admin-template-angular', port: 4207 },
  { id: 'vue', name: 'Vue', project: 'rxdb-admin-template-vue', port: 4208 }
];

/** 协作命令服务（Node 入口），三端开发服务器 `/collaboration-api` 的默认代理目标。 */
export const api = { name: '协作命令服务', port: 8088 };

/** 开发导航：服务入口、测试账号与验证码、连接信息和常用命令。 */
export const dashboard = { name: '开发导航', port: 4209 };

export const appUrl = app => `http://${host}:${app.port}`;
export const apiUrl = `http://${host}:${api.port}`;
export const dashboardUrl = `http://${host}:${dashboard.port}/`;

/** 浏览器打开三端开发服务器时的来源：网关 CORS 与协作命令服务都按这一份放行。 */
export const devOrigins = apps.flatMap(app => [`http://127.0.0.1:${app.port}`, `http://localhost:${app.port}`]);

/** 本地 Supabase 栈：网关（Auth / REST / Realtime / Functions）、收件服务、错误收集器、Studio、数据库直连与连接池。 */
export const stack = {
  gateway: local.supabaseUrl,
  mail: local.mailUrl,
  collector: local.collectorUrl,
  studio: `http://${host}:${ports.studio}`,
  database: ports.database,
  pooler: ports.pooler
};
