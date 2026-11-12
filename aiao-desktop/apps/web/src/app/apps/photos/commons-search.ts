import { ImportedPhoto } from './photo-library';

interface CommonsImageInfo {
  readonly thumburl?: string;
  readonly extmetadata?: { readonly Artist?: { readonly value?: string } };
}

interface CommonsPage {
  readonly title: string;
  readonly imageinfo?: readonly CommonsImageInfo[];
}

interface CommonsResponse {
  readonly query?: { readonly pages?: Readonly<Record<string, CommonsPage>> };
}

/** 摄影师名字里常带着链接标签和多余空白，清掉并截短。 */
const creditOf = (info: CommonsImageInfo): string =>
  String(info.extmetadata?.Artist?.value ?? 'Unknown')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 42) || 'Unknown';

/** 文件页标题转成可读的照片名：去掉 `File:` 前缀、扩展名和下划线。 */
const titleOf = (page: CommonsPage): string =>
  page.title
    .replace(/^File:/, '')
    .replace(/\.[a-z]+$/i, '')
    .replace(/_/g, ' ')
    .slice(0, 60);

/** 在维基共享资源上搜图：不需要密钥，支持跨域，每一条结果都带着署名。 */
export async function searchCommons(query: string): Promise<ImportedPhoto[]> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
    `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${query}`)}` +
    '&gsrlimit=18&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=250&format=json&origin=*';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = (await response.json()) as CommonsResponse;
  return Object.values(json.query?.pages ?? {}).flatMap(page => {
    const info = page.imageinfo?.[0];
    return info?.thumburl ? [{ title: titleOf(page), credit: creditOf(info), thumb: info.thumburl }] : [];
  });
}
