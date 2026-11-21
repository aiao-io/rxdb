const fileVersion = /^[0-9a-f]{64}(?:-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/;

/** 文件版本保留内容摘要，显式重新上传追加独立的请求标识。 */
export function isImageFileVersion(value: unknown, digest: string): value is string {
  return typeof value === 'string' && fileVersion.test(value) && value.slice(0, 64) === digest;
}
