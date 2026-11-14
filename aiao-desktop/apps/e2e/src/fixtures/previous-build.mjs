import { resolve } from 'node:path';

/** 升级起点可以是固定提交的产物，或固定生产部署的 HTTPS 根地址。 */
export function previousBuildSource(env) {
  const dist = env.AIAO_DESKTOP_PREVIOUS_DIST;
  const address = env.AIAO_DESKTOP_PREVIOUS_URL;
  if (dist && address) throw new Error('升级起点只能指定一个：AIAO_DESKTOP_PREVIOUS_DIST 或 AIAO_DESKTOP_PREVIOUS_URL');
  if (dist) return { dist: resolve(dist) };
  if (!address) throw new Error('缺少升级起点：指定 AIAO_DESKTOP_PREVIOUS_DIST 或 AIAO_DESKTOP_PREVIOUS_URL');
  const url = new URL(address);
  if (url.protocol !== 'https:') throw new Error('线上升级起点必须是 HTTPS');
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('线上升级起点必须是无凭据、查询和片段的根地址');
  return { url: url.origin };
}
