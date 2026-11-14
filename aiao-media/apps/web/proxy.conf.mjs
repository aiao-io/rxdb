import { startDevRelay } from '../api/scripts/dev-relay.mjs';

// 旧静态开发入口仍使用同一 Worker；正式开发入口由 scripts/dev/proxy.conf.mjs 转发完整产品 API。
const relay = await startDevRelay();

export default {
  '/api/relay': { target: relay.url }
};
