/**
 * 浏览器夹具页的服务：启动时用 esbuild 把 `harness.ts` 连同 P2P 包的构建产物打成一个浏览器 bundle，
 * 放在内存里供页面加载。由 Playwright 的 webServer 以 `node src/browser/serve.ts` 启动。
 */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { HARNESS_PORT } from './harness-api.ts';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./harness.ts', import.meta.url))],
  // 不读 tsconfig：它继承的 paths 会把 @aiao/* 映射到 TS 源码。夹具页与桌面端一样，只运行
  // node_modules 解析到的构建产物（dist），测的就是要发布的那份代码。
  tsconfigRaw: {},
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  sourcemap: 'inline',
  logLevel: 'warning'
});
const script = bundle.outputFiles[0].text;
const page = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8"><title>P2P acceptance harness</title></head>',
  '<body><script type="module" src="/harness.js"></script></body></html>'
].join('');

createServer((request, response) => {
  const isScript = request.url === '/harness.js';
  response.writeHead(200, { 'content-type': isScript ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
  response.end(isScript ? script : page);
}).listen(HARNESS_PORT, '127.0.0.1', () => console.log(`P2P harness listening on http://127.0.0.1:${HARNESS_PORT}`));
