// 运行时宿主页的本地静态服务（US-409）：每种独立源运行时独占一个源、跨源隔离，只允许部署配置里的工作台来源嵌入。
// 用法：node scripts/serve-runtime-hosts.mjs（先构建 runtime-hosts；部署配置里 localhost 上的宿主源各起一个端口）
import { readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { RUNTIME_HOSTS, hostParents } from '../src/runtime-hosts/hosts.ts';
import { runtimeHostHeaders } from '../src/workbench/terminal/runtime-host-pages.ts';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.bin': 'application/octet-stream'
};
/** 带内容哈希的 Worker 资源与钉死哈希的 vendor 包不会变，其余每次重新验证。 */
const cacheControl = path =>
  path.startsWith('/assets/') || path.startsWith('/vendor/') ? 'public, max-age=31536000, immutable' : 'no-cache';

async function serve({ runtime, origin, parents }) {
  const root = await realpath(resolve(import.meta.dirname, '../runtime-hosts/dist', runtime));
  // 与线上 Pages 的 _headers 同一组（build-runtime-hosts.mjs 生成）
  const headers = runtimeHostHeaders(parents);
  const file = async pathname => {
    const target = await realpath(join(root, pathname));
    if (target !== root && !target.startsWith(`${root}${sep}`))
      throw Object.assign(new Error('越界'), { code: 'ENOENT' });
    return { target, body: await readFile(target) };
  };
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', origin).pathname);
    try {
      const { target, body } = await file(pathname);
      response.writeHead(200, {
        ...headers,
        'Content-Type': types[extname(target)] ?? 'application/octet-stream',
        'Cache-Control': cacheControl(pathname)
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EISDIR' && error.code !== 'ENOTDIR') throw error;
      response.writeHead(404, headers).end();
    }
  });
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(Number(new URL(origin).port), 'localhost', done);
  });
  return `${runtime} ${origin}/（允许嵌入：${parents.join('、')}）`;
}

const hosts = Object.entries(RUNTIME_HOSTS).flatMap(([runtime, table]) =>
  [...new Set(Object.values(table))]
    .filter(origin => new URL(origin).hostname === 'localhost')
    .map(origin => ({ runtime, origin, parents: hostParents(table, origin) }))
);
const ready = await Promise.all(hosts.map(serve));
console.log(`运行时宿主已就绪：\n  ${ready.join('\n  ')}`);
