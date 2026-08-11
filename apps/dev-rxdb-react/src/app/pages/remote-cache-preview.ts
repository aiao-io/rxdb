export function isImageMimeType(mimeType: string): boolean {
  return mimeType.trim().toLowerCase().startsWith('image/');
}
