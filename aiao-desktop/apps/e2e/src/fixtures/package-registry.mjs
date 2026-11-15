import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const name = 'aiao-terminal-smoke';
const version = '1.0.0';
const registry = 'https://registry.npmjs.org';
const tarball = `${registry}/${name}/-/${name}-${version}.tgz`;
const bytes = readFileSync(new URL('./terminal-package.tgz', import.meta.url));
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

/** 为终端安装验证提供固定 registry 应答，真实运行 npm 下载、校验与解包，其他外网仍由冒烟拦截。 */
export async function installPackageRegistry(context) {
  await context.route(`${registry}/${name}`, route => route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({
      name,
      'dist-tags': { latest: version },
      versions: { [version]: { name, version, dist: { tarball, integrity } } }
    })
  }));
  await context.route(tarball, route => route.fulfill({
    contentType: 'application/octet-stream',
    headers: { 'access-control-allow-origin': '*' },
    body: bytes
  }));
}
