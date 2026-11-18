import { collaborationService } from './start.js';

// 特殊业务检查（`checks`，见 checks.ts 的 RecordCheck）在这里注入：collaborationService(process.env, { engine: { checks } })；默认没有
const { server, pool, rules } = collaborationService(process.env, {
  onError: error => console.error('Collaboration API internal error:', error)
});
server.listen(Number(process.env['ADMIN_API_PORT'] ?? 8088), process.env['ADMIN_API_HOST'] ?? '127.0.0.1', () =>
  console.info(`Collaboration API ready (token keys: ${rules.keys.kind}, issuer: ${rules.issuer ?? 'none'})`)
);
const stop = () =>
  server.close(() => {
    void pool.end();
  });
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
