import { setGlobalProxyFromEnv } from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { unstable_startWorker } from 'wrangler';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '8788' },
    config: { type: 'string', default: fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)) },
    'env-file': { type: 'string', multiple: true }
  }
});
const restoreProxy = setGlobalProxyFromEnv({
  ...process.env,
  no_proxy: process.env.no_proxy ?? process.env.NO_PROXY ?? 'localhost,127.0.0.1,::1'
});
const worker = await unstable_startWorker({
  config: values.config,
  envFiles: values['env-file'],
  dev: {
    server: { hostname: '127.0.0.1', port: Number(values.port) },
    outboundService: request => fetch(request.url, request)
  }
});

async function stop() {
  await worker.dispose();
  restoreProxy();
  process.exit(0);
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
await worker.ready;
console.log(`Model Design Worker: ${await worker.url}`);
