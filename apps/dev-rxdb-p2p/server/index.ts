/**
 * dev-rxdb-p2p 的 Cloudflare Worker 入口。
 *
 * @remarks
 * workerd 把入口模块的每个具名导出都当成入口（处理器或 Durable Object 类），所以这里只导出这两样，
 * 路由与常量放在 `router.ts`。
 */
import { handleRequest } from './router';

export { PoolLimiter } from './pool-limiter';
export { SignalingRoom } from './signaling-room';

export default {
  fetch: handleRequest
};
