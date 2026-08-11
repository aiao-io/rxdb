export type RemoteCachePreviewKind = 'image' | 'audio' | 'video' | 'text' | 'document' | 'download';

export function resolveRemoteCachePreviewKind(mimeType: string): RemoteCachePreviewKind {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('text/')) return 'text';
  if (normalized === 'application/json' || normalized.endsWith('+json')) return 'text';
  if (normalized === 'application/xml' || normalized.endsWith('+xml')) return 'text';
  if (normalized === 'application/pdf') return 'document';
  return 'download';
}
