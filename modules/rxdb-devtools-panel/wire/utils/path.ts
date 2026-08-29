/**
 * 路径处理工具函数
 */

/**
 * 规范化 OPFS 路径
 * 将绝对路径 /name 转换为相对路径 ./name
 */
export function normalizePath(path: string): string {
  return path.startsWith('/') ? '.' + path : path;
}
