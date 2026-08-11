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
