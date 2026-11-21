/** 文件名的稳定种子：同一个文件生成的预览图永远一样。 */
export function nameSeed(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return h;
}

/** 图片缩略图用到的构图：只取原图生成器的 0、1、3 三种。 */
export const shotKind = (name: string): number => [0, 1, 3][nameSeed(name) % 3];
