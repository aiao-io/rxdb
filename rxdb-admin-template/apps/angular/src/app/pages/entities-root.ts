/**
 * 判断 URL 是否停在 `/entities` 根路径：忽略查询串、片段与尾部斜杠。
 *
 * @remarks Angular 的 URL 序列化会保留尾部斜杠，深链 `/entities/` 的 `router.url` 仍是 `/entities/`，
 * 不去掉斜杠就比不上 `/entities`，壳页也就不会跳到首个实体。
 * @param url - 路由器当前 URL。
 * @returns 停在根路径时为 `true`。
 */
export function isEntitiesRoot(url: string): boolean {
  return url.split(/[?#]/, 1)[0].replace(/\/+$/, '') === '/entities';
}
