import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export function resolveWithin(root, requestPath) {
  if (requestPath.includes('\0') || requestPath.includes('\\')) return null;
  const absolutePath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  const candidate = resolve(root, `.${absolutePath}`);
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) return null;
  return candidate;
}

export function resolvePreviewPath(root, requestPath) {
  if (requestPath === '/') return resolveWithin(root, '/index.html');
  const htmlPath = resolveWithin(root, `${requestPath}.html`);
  if (!htmlPath) return null;
  return existsSync(htmlPath) ? htmlPath : resolveWithin(root, requestPath);
}

export function matchRedirect(pathname, rules) {
  for (const { from, to, status } of rules) {
    if (from === pathname) return { to, status };
    if (!from.endsWith('/*')) continue;
    const prefix = from.slice(0, -1);
    if (pathname.startsWith(prefix)) return { to: to.replace(':splat', () => pathname.slice(prefix.length)), status };
  }
  return null;
}
