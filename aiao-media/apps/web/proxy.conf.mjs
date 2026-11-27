import { startDevRelay } from '../api/scripts/dev-relay.mjs';

// 独立开发入口将全部产品 API 转发给内嵌 Worker。
const relay = await startDevRelay();

export default {
  '/api/**': { target: relay.url }
};
