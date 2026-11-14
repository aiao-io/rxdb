import { requireCondition } from '../core/errors.js';
import { normalizeRoute } from '../core/routes.js';

export function parseEditorRoute(route: string): { fileId: string | null; line: number } {
  const url = new URL(normalizeRoute(route), 'https://editor.invalid/');
  requireCondition(url.pathname === '/' || /^\/documents\/[^/]+$/.test(url.pathname), 'UNSUPPORTED', '文档位置不存在');
  const line = Number(url.searchParams.get('line') ?? (/^#L\d+$/.test(url.hash) ? url.hash.slice(2) : '1'));
  requireCondition(Number.isSafeInteger(line) && line > 0, 'INVALID', '文档行号必须是正整数');
  return { fileId: url.pathname === '/' ? null : decodeURIComponent(url.pathname.slice(11)), line };
}

export function documentRoute(fileId: string, line = 1): string {
  return `/documents/${encodeURIComponent(fileId)}` + (line === 1 ? '' : `?line=${line}#L${line}`);
}
