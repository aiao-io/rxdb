export type OpfsPreviewType = 'image' | 'audio' | 'video' | 'code' | 'text' | 'unknown';

export function resolveOpfsStringPreviewType(type: OpfsPreviewType, mimeType: string): OpfsPreviewType {
  if (type !== 'unknown') {
    return type;
  }
  return mimeType.startsWith('text/') ? 'text' : 'unknown';
}
