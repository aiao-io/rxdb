/**
 * 本地开发的固定入口。端口固定，被占用时直接报错，不自动换号。
 * web 的 `serve`、`serve-static` 与产品根 `dev` 目标里的端口和就绪探测地址必须与这里一致，由 services.spec.mjs 校验。
 */
export const services = {
  web: { name: 'Web 开发服务器', host: 'localhost', port: 4410 },
  preview: { name: '正式构建预览', host: '127.0.0.1', port: 4411 },
  dashboard: { name: '开发导航', host: '127.0.0.1', port: 4412 }
};

/** Angular 开发服务器：改代码自动刷新，带跨源隔离响应头。 */
export const webUrl = `http://${services.web.host}:${services.web.port}`;

/** 正式构建的本地静态服务器（`aiao-desktop-web:serve-static`），按需启动。 */
export const previewUrl = `http://${services.preview.host}:${services.preview.port}`;

/** 开发导航：只监听本机回环地址，不进入 web 的构建产物。 */
export const dashboardUrl = `http://${services.dashboard.host}:${services.dashboard.port}/`;
