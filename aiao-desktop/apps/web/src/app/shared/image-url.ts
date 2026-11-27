/** 能放进 data: 地址预览的图片上限；再大的图拼成 base64 字符串会占掉太多内存。 */
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

/** 每次交给 `String.fromCharCode` 的字节数：展开参数太多会撑爆调用栈。 */
const CHUNK = 0x8000;

/**
 * 把图片字节放进 `data:` 地址。
 *
 * 桌面页面是跨源隔离的（COEP `require-corp`，D-05），WebKit 在这种页面里加载不了任何 `blob:` 地址
 * （`<img>`、`fetch`、`Worker` 都失败），所以图片预览不能用 `URL.createObjectURL`；`data:` 地址在三个引擎里都能用。
 *
 * @throws Error 图片超过 {@link MAX_IMAGE_BYTES}
 */
export function imageDataUrl(bytes: Uint8Array, type: string): string {
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`The image is too large to preview (${bytes.length} bytes).`);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  return `data:${type};base64,${btoa(binary)}`;
}
