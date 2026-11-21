/** Finder 的各个视图共用同一张缩略图。 */
const MAX_EDGE = 512;
export const THUMBNAIL_MIME_TYPE = 'image/png';

/** 等比缩小原图，保留透明通道，小图不放大。 */
export async function generateImageThumbnail(original: Blob): Promise<Blob> {
  const image = await createImageBitmap(original);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable.');
    context.drawImage(image, 0, 0, width, height);
    return await canvas.convertToBlob({ type: THUMBNAIL_MIME_TYPE });
  } finally {
    image.close();
  }
}
