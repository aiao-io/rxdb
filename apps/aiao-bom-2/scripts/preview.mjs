import { parseArgs, startStaticServer } from '../../../scripts/e2e-static-server.mjs';
const options = parseArgs(process.argv.slice(2));
const server = await startStaticServer(options);
server.prependListener('request', (_request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
});
console.log(`aiao-bom-2 preview: http://localhost:${options.port}`);
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { server.close(); server.closeAllConnections(); });
