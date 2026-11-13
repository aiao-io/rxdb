/**
 * 本地开发的固定入口。端口固定，被占用时直接报错，不自动换号。
 * 各 `dev` 目标里的端口与就绪探测地址必须与这里一致，由 services.spec.mjs 校验。
 */
export const services = {
  web: { name: 'Web', host: 'localhost', port: 4400 },
  worker: { name: 'Worker', host: '127.0.0.1', port: 8788 }
};

/** Angular 开发服务器：设计器与登录页，`/api/**`、`/bff/**` 经开发代理转给 Worker。 */
export const webUrl = `http://${services.web.host}:${services.web.port}`;

/** 本地 Worker：登录会话与智能体会话签发。 */
export const workerUrl = `http://${services.worker.host}:${services.worker.port}`;

/** 开发导航由本地 Worker 在根路径提供，不进入 web 的构建产物。 */
export const dashboardUrl = `${workerUrl}/`;
