/** 当前部署支持的文件回退地址；只返回可安全附带凭据的规范路径。 */
export const fallbackSource = (
  sourceUrl: string,
  contentHash: string,
  origin: string
): { readonly path: string; readonly encHash: string | null } | null => {
  let url: URL;
  try {
    url = new URL(sourceUrl, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.username || url.password || url.search || url.hash) return null;
  const match = /^\/api\/files\/(enc\/)?([0-9a-f]{64})$/.exec(url.pathname);
  if (!match || (!match[1] && match[2] !== contentHash)) return null;
  return { path: url.pathname, encHash: match[1] ? match[2]! : null };
};
