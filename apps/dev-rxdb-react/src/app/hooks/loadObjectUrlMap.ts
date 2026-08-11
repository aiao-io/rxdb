import { useEffect, useState } from 'react';

interface LoadObjectUrlMapOptions<T> {
  items: T[];
  getKey: (item: T) => string;
  loadUrl: (item: T) => Promise<string | null>;
  isCurrent: () => boolean;
  revokeUrl: (url: string) => void;
  concurrency?: number;
}

export async function loadObjectUrlMap<T>({
  items,
  getKey,
  loadUrl,
  isCurrent,
  revokeUrl,
  concurrency = 5
}: LoadObjectUrlMapOptions<T>): Promise<Map<string, string>> {
  const urls = new Map<string, string>();

  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    await Promise.all(
      batch.map(async item => {
        try {
          const url = await loadUrl(item);
          if (!url) return;
          if (!isCurrent()) {
            revokeUrl(url);
            return;
          }
          urls.set(getKey(item), url);
        } catch {
          return;
        }
      })
    );
    if (!isCurrent()) break;
  }

  if (isCurrent()) return urls;
  urls.forEach(revokeUrl);
  return new Map();
}

interface UseObjectUrlMapOptions<T> {
  items: T[];
  getKey: (item: T) => string;
  loadUrl: (item: T) => Promise<string | null>;
  revokeUrl: (url: string) => void;
}

export function useObjectUrlMap<T>({
  items,
  getKey,
  loadUrl,
  revokeUrl
}: UseObjectUrlMapOptions<T>): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let current = true;
    const ownedUrls = new Map<string, string>();
    const timeout = window.setTimeout(() => {
      void loadObjectUrlMap({ items, getKey, loadUrl, isCurrent: () => current, revokeUrl }).then(nextUrls => {
        if (!current) return;
        nextUrls.forEach((url, key) => ownedUrls.set(key, url));
        setUrls(nextUrls);
      });
    }, 0);

    return () => {
      current = false;
      window.clearTimeout(timeout);
      ownedUrls.forEach(revokeUrl);
    };
  }, [getKey, items, loadUrl, revokeUrl]);

  return urls;
}
