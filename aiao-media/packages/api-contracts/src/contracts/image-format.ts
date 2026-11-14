/** 本机原图支持的媒体类型。 */
export type ImageMimeType = 'image/png' | 'image/jpeg';
/** 从原图字节读取的格式与尺寸。 */
export interface ImageMetadata {
  mimeType: ImageMimeType;
  width: number;
  height: number;
}
/** 原图格式、尺寸或解码失败。 */
export class ImageFormatError extends Error {}
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg' } as const;
/** 判断媒体类型是否属于受支持的原图。 */
export function isImageMimeType(value: string): value is ImageMimeType {
  return value === 'image/png' || value === 'image/jpeg';
}
/** 返回与真实媒体类型一致的文件后缀。 */
export function imageExtension(mimeType: ImageMimeType): 'png' | 'jpg' {
  return extensions[mimeType];
}
function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  const invalid = () => new ImageFormatError('图片不是有效的 PNG/JPEG，结果未保存。');
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255) break;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (frames.has(marker) && length >= 8)
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    offset += length;
  }
  throw invalid();
}
/** 解码前验证原图签名、分段边界、大小与尺寸上限。 */
export function imageMetadata(bytes: Uint8Array): ImageMetadata {
  if (!bytes.length || bytes.length > 16 * 1024 * 1024)
    throw new ImageFormatError('图片不是有效的 PNG/JPEG，结果未保存。');
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (!png) return boundedDimensions({ mimeType: 'image/jpeg', ...jpegDimensions(bytes) });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 33 || view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR')
    throw new ImageFormatError('图片不是有效的 PNG/JPEG，结果未保存。');
  return boundedDimensions({ mimeType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) });
}
function boundedDimensions(metadata: ImageMetadata): ImageMetadata {
  const { width, height } = metadata;
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16_777_216)
    throw new ImageFormatError('图片尺寸无效或超限，未解码或保存。');
  return metadata;
}
/** 校验 MIME 与原始字节一致，并确认图片可解码且尺寸一致。 */
export async function validateImageBlob(blob: Blob, limitBytes = 16 * 1024 * 1024): Promise<ImageMetadata> {
  if (!isImageMimeType(blob.type) || !blob.size || blob.size > limitBytes)
    throw new ImageFormatError('图片格式或大小无效，仅支持上限内的 PNG/JPEG 原图。');
  const metadata = imageMetadata(new Uint8Array(await blob.arrayBuffer()));
  if (metadata.mimeType !== blob.type) throw new ImageFormatError('图片 MIME 与真实内容不符。');
  let decoded: ImageBitmap;
  try {
    decoded = await createImageBitmap(blob);
  } catch {
    throw new ImageFormatError('图片无法解码，未标记本地已保存。');
  }
  try {
    if (decoded.width !== metadata.width || decoded.height !== metadata.height)
      throw new ImageFormatError('图片尺寸与实际内容不符，结果未保存。');
  } finally {
    decoded.close();
  }
  return metadata;
}
