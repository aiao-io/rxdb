import { collaborationService } from './start.js';

// 特殊业务检查（`checks`，见 checks.ts 的 RecordCheck）在这里注入：collaborationService(process.env, { engine: { checks } })；默认没有。
// 未处理错误经脱敏后写标准错误（`ADMIN_ERROR <JSON>`），配置了 ADMIN_ERROR_REPORT_URL 时另发给收集器（见 monitor.ts）
const { server, pool, rules } = collaborationService(process.env);
server.listen(Number(process.env['ADMIN_API_PORT'] ?? 8088), process.env['ADMIN_API_HOST'] ?? '127.0.0.1', () =>
  console.info(`Collaboration API ready (token keys: ${rules.keys.kind}, issuer: ${rules.issuer ?? 'none'})`)
);
const stop = () =>
  server.close(() => {
    void pool.end();
  });
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
