/** 内置站点：不走网络，直接在窗口里渲染。 */
export interface LocalSite {
  readonly title: string;
  readonly fav: string;
}

/** 收藏夹条目：名称、色块和地址。 */
export interface Favourite {
  readonly name: string;
  readonly color: string;
  readonly url: string;
}

/** 地址栏输入的归类，决定页面怎么画。 */
export type PageKind = 'start' | 'local' | 'wiki' | 'video' | 'web' | 'search';

/** 文件内自带的页面，其余地址一律走网络。 */
export const LOCAL_SITES: ReadonlyMap<string, LocalSite> = new Map([['apple.com', { title: 'Apple', fav: '#111' }]]);

export const FAVOURITES: readonly Favourite[] = [
  { name: 'Apple', color: '#1d1d1f', url: 'apple.com' },
  { name: 'Wikipedia', color: '#636466', url: 'en.wikipedia.org/wiki/MacOS' },
  { name: 'YouTube', color: '#ff0033', url: 'youtube.com' },
  { name: 'Hacker News', color: '#ff6600', url: 'news.ycombinator.com' },
  { name: 'MDN', color: '#000', url: 'developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter' },
  { name: 'Can I use', color: '#1d78c1', url: 'caniuse.com' },
  { name: 'Internet Archive', color: '#000', url: 'archive.org' },
  { name: 'JSFiddle', color: '#0084ff', url: 'jsfiddle.net' }
];

/** 阅读列表：地址与显示名。 */
export const READING_LIST: readonly (readonly [string, string])[] = [
  ['en.wikipedia.org/wiki/Bézier_curve', 'Bézier curve'],
  ['en.wikipedia.org/wiki/Subpixel_rendering', 'Subpixel rendering']
];

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

export const hostOf = (url: string): string => stripScheme(url).split('/')[0];

/** DuckDuckGo 对没有图标的主机也回 200，缺图标表现为解码失败，样式可以绕开它。 */
export const faviconOf = (host: string): string => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`;

/** 补全协议，用于抓取与内嵌。 */
export const resolveUrl = (url: string): string => (/^https?:\/\//.test(url) ? url : `https://${url}`);

/** 补全协议，用于分享与「在新窗口打开」。 */
export const externalUrl = (url: string): string => (/^https?:/.test(url) ? url : `https://${url}`);

/** 地址若对应内置站点，返回站点登记的键（如 `apple.com`）。 */
export const localKey = (url: string): string | undefined => (LOCAL_SITES.has(bare(url)) ? bare(url) : undefined);

/** 归类地址栏输入：含点且无空格的当作网址，其余都是搜索，和真实的地址栏一致。 */
export function kindOf(url: string): PageKind {
  const text = stripScheme(url);
  if (!text.trim()) return 'start';
  if (LOCAL_SITES.has(text.replace(/\/$/, ''))) return 'local';
  if (/^en\.wikipedia\.org\/wiki\//.test(text)) return 'wiki';
  if (/(^|\.)youtube\.com\/watch\?v=|(^|\.)youtu\.be\//.test(text)) return 'video';
  if (/^[^\s/]+\.[a-z]{2,}(\/|$|\?)/i.test(text)) return 'web';
  return 'search';
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
  if (kind === 'wiki') return `${wikiTitle(url).replace(/_/g, ' ')} — Wikipedia`;
  if (kind === 'search') return `${url} — Search`;
  return hostOf(url);
}

/** 标签与概览里的小色块；返回 null 表示要取真正的站点图标。 */
export function favColor(url: string): string | null {
  const site = LOCAL_SITES.get(bare(url));
  if (site) return site.fav;
  const kind = kindOf(url);
  return kind === 'search' || kind === 'start' ? '#8e8e93' : null;
}

/**
 * file:// 页面分不清被拒绝的 iframe 和正常的 iframe：两者都会触发 load，也都因父页面源不透明
 * 而拒绝访问 DOM。所以只对已知允许内嵌的主机直接用 iframe，其余当文本读。
 */
export function framable(url: string): boolean {
  const host = hostOf(url).replace(/^www\./, '');
  return /(^|\.)(example\.(com|org)|youtube(-nocookie)?\.com|youtu\.be|player\.vimeo\.com|jsfiddle\.net|archive\.org|wikipedia\.org|github\.io|caniuse\.com)$/.test(
    host
  );
}
