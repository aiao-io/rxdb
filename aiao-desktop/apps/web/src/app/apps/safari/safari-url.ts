/** 内置站点：不走网络，直接在窗口里渲染。 */
export interface LocalSite {
  readonly title: string;
  readonly fav: string;
}

/** 地址栏输入的归类，决定页面怎么画。 */
export type PageKind = 'start' | 'local' | 'wiki' | 'video' | 'web' | 'search' | 'file';

/** 文件内自带的页面，其余地址一律走网络。 */
export const LOCAL_SITES: ReadonlyMap<string, LocalSite> = new Map([['apple.com', { title: 'Apple', fav: '#111' }]]);

const stripScheme = (url: string): string => url.replace(/^https?:\/\//, '');

/** 去掉协议和末尾斜杠。 */
const bare = (url: string): string => stripScheme(url).replace(/\/$/, '');

/** 地址栏里手写的百分号编码可能不合法，解不开就原样保留。 */
const decode = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** 取主机名，不含协议和路径。 */
export const hostOf = (url: string): string => stripScheme(url).split('/')[0];

/** DuckDuckGo 对没有图标的主机也回 200，缺图标表现为解码失败，样式可以绕开它。 */
export const faviconOf = (host: string): string => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`;

/** 补全协议，用于抓取与内嵌。 */
export const resolveUrl = (url: string): string => (/^https?:\/\//.test(url) ? url : `https://${url}`);

/**
 * 地址是否与 `origin` 同源，`url` 要已补全协议（见 `resolveUrl`）。内嵌框带 `allow-scripts allow-same-origin`：
 * 跨源网站只是保留它们自己的来源；与桌面同源的页面却能访问父页面的存储与 DOM，还能摘掉框上的 sandbox，所以不能内嵌。
 * 来源按 URL 标准规整（主机名大小写、默认端口、用户名密码都不影响）；解析不了的地址浏览器也加载不了，不算同源；
 * 从磁盘打开的桌面来源是 `"null"`（不透明来源），不与任何地址匹配。
 */
export function isSameOrigin(url: string, origin: string): boolean {
  if (origin === 'null' || !URL.canParse(url)) return false;
  return new URL(url).origin === origin;
}

/** 补全协议，用于分享与「在新窗口打开」。 */
export const externalUrl = (url: string): string => (/^https?:/.test(url) ? url : `https://${url}`);

/** 地址若对应内置站点，返回站点登记的键（如 `apple.com`）。 */
export const localKey = (url: string): string | undefined => (LOCAL_SITES.has(bare(url)) ? bare(url) : undefined);

/** 归类地址栏输入：含点且无空格的当作网址，`file://` 是磁盘文件，其余都是搜索，和真实的地址栏一致。 */
export function kindOf(url: string): PageKind {
  const text = stripScheme(url);
  if (!text.trim()) return 'start';
  if (text.startsWith('file://')) return 'file';
  if (LOCAL_SITES.has(text.replace(/\/$/, ''))) return 'local';
  if (/^en\.wikipedia\.org\/wiki\//.test(text)) return 'wiki';
  if (/(^|\.)youtube\.com\/watch\?v=|(^|\.)youtu\.be\//.test(text)) return 'video';
  if (/^[^\s/]+\.[a-z]{2,}(\/|$|\?)/i.test(text)) return 'web';
  return 'search';
}

/** 磁盘文件在地址栏里的写法：`file:///` 后跟逐段编码的卷内路径。 */
export const fileUrlOf = (path: readonly string[]): string =>
  `file:///${path.map(part => encodeURIComponent(part)).join('/')}`;

/** 从地址栏里的 file 地址取回卷内路径；不是 file 地址或解码不了时为 undefined。 */
export function filePathOf(url: string): readonly string[] | undefined {
  if (!url.startsWith('file:///')) return undefined;
  const parts = url.slice('file:///'.length).split('/');
  if (!parts.length || !parts[0]) return undefined;
  try {
    return parts.map(part => decodeURIComponent(part));
  } catch {
    return undefined;
  }
}

/** 维基条目名；地址里没有条目时为空串。 */
export const wikiTitle = (url: string): string => decode(bare(url).split('/wiki/')[1] || '');

/** YouTube 视频 id，认不出时为 undefined。 */
export function videoId(url: string): string | undefined {
  const text = bare(url);
  return (text.match(/[?&]v=([\w-]{6,})/) ?? text.match(/youtu\.be\/([\w-]{6,})/))?.[1];
}

/** 标题要在内容到达之前就定下来，否则标签条会闪。 */
export function titleFor(url: string): string {
  const site = LOCAL_SITES.get(bare(url));
  if (site) return site.title;
  const kind = kindOf(url);
  if (kind === 'start') return 'Start Page';
  if (kind === 'file') return filePathOf(url)?.at(-1) ?? 'File';
  if (kind === 'wiki') return `${wikiTitle(url).replace(/_/g, ' ')} — Wikipedia`;
  if (kind === 'search') return `${url} — Search`;
  return hostOf(url);
}

/** 标签与概览里的小色块；返回 null 表示要取真正的站点图标。 */
export function favColor(url: string): string | null {
  const site = LOCAL_SITES.get(bare(url));
  if (site) return site.fav;
  const kind = kindOf(url);
  return kind === 'search' || kind === 'start' || kind === 'file' ? '#8e8e93' : null;
}
