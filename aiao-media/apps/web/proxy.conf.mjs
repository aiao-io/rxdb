import { startDevRelay } from '../api/scripts/dev-relay.mjs';

// Loaded once by the Angular dev server. The relay runs inside that process on a free loopback port and gets
// only /api/relay, so `aiao-media:serve` generates images through the production Worker code without a second
// process. The dev server's config loader supports the top-level await.
const relay = await startDevRelay();

export default {
  '/api/relay': { target: relay.url }
};
