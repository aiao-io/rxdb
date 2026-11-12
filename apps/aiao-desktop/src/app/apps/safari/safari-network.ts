import { mdHTML } from './safari-markdown';
import { hostOf, resolveUrl } from './safari-url';

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
/** 带 CORS 的正文抽取器，把文章转成 Markdown；没有 iframe，也就没有 X-Frame-Options 可争。 */
const READER = 'https://r.jina.ai/';
const WIKI_NOT_FOUND = 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found';
const REQUEST: RequestInit = { referrerPolicy: 'no-referrer' };

/** 维基条目：摘要、可选缩略图和清理过的导语 HTML。 */
export interface WikiArticle {
  readonly title: string;
  readonly description: string;
  readonly extract: string;
  readonly thumbnail: string;
  /** 清理后的导语；解析接口不可用时为空串，由摘要顶上。 */
  readonly lead: string;
}

/** 维基搜索的一条命中；`snippet` 是接口给的 HTML 片段。 */
export interface WikiHit {
  readonly title: string;
  readonly snippet: string;
}

/** 阅读器抽取出的文章：标题与已转成 HTML 的正文。 */
export interface ReaderArticle {
  readonly title: string;
  readonly html: string;
}

interface WikiSummary {
  readonly type?: string;
  readonly title?: string;
  readonly titles?: { readonly display?: string };
  readonly description?: string;
  readonly extract?: string;
  readonly thumbnail?: { readonly source: string };
}

interface WikiParse {
  readonly parse?: { readonly text?: { readonly '*'?: string } };
}

interface WikiSearch {
  readonly query?: { readonly search?: readonly WikiHit[] };
}

/** 摘掉事件处理属性：清理后的 HTML 会绕过 Angular 的消毒器，不能再带脚本入口。 */
function stripHandlers(box: Element): void {
  box.querySelectorAll('*').forEach(node => {
    node
      .getAttributeNames()
      .filter(name => name.startsWith('on'))
      .forEach(name => node.removeAttribute(name));
  });
}

/**
 * 只取导语里的正文：去掉表格、脚注等噪音，站内链接改成 `data-goto` 在本浏览器里导航，
 * 协议相对的图片地址钉成 https。用 DOMParser 解析，图片和脚本在清理完之前都不会动。
 */
function cleanLead(html: string): string {
  const box = new DOMParser().parseFromString(html, 'text/html').body;
  box
    .querySelectorAll('style,script,.mw-editsection,.reference,sup.reference,.hatnote,.navbox,table,figure,.thumb')
    .forEach(node => node.remove());
  box.querySelectorAll('a[href^="/wiki/"]').forEach(link => {
    link.setAttribute('data-goto', `en.wikipedia.org${link.getAttribute('href')}`);
    link.removeAttribute('href');
  });
  box.querySelectorAll('a[href]').forEach(link => link.removeAttribute('href'));
  box.querySelectorAll('img').forEach(image => {
    const src = image.getAttribute('src') ?? '';
    if (src.startsWith('//')) image.setAttribute('src', `https:${src}`);
    image.removeAttribute('srcset');
  });
  stripHandlers(box);
  return box.innerHTML;
}

/** 取一个维基条目；条目不存在或摘要接口失败时抛错。 */
export async function fetchWikiArticle(title: string): Promise<WikiArticle> {
  const page = encodeURIComponent(title);
  const [summary, parsed] = await Promise.all([
    fetch(WIKI_REST + page, REQUEST).then(response => response.json() as Promise<WikiSummary>),
    fetch(`${WIKI_API}?action=parse&page=${page}&prop=text&section=0&format=json&origin=*`, REQUEST)
      .then(response => response.json() as Promise<WikiParse>)
      .catch(() => null)
  ]);
  if (summary.type === WIKI_NOT_FOUND) throw new Error('404');
  const lead = parsed?.parse?.text?.['*'];
  return {
    /* 条目带显示标题——macOS，而不是 MacOS。 */
    title: (summary.titles?.display || summary.title || title).replace(/<[^>]+>/g, ''),
    description: summary.description ?? '',
    extract: summary.extract ?? '',
    thumbnail: summary.thumbnail?.source ?? '',
    lead: lead ? cleanLead(lead) : ''
  };
}

/** 维基全文搜索；网络失败时抛错，没有命中时返回空数组。 */
export async function fetchWikiSearch(query: string): Promise<readonly WikiHit[]> {
  const response = await fetch(
    `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json&origin=*`,
    REQUEST
  );
  const result = (await response.json()) as WikiSearch;
  return result.query?.search ?? [];
}

/** 用抽取器读一篇网页；抓取失败、超时（15 秒）或正文过短时抛错。 */
export async function fetchReader(url: string): Promise<ReaderArticle> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(READER + resolveUrl(url), { signal: controller.signal, ...REQUEST });
    if (!response.ok) throw new Error(String(response.status));
    const raw = await response.text();
    const title = (raw.match(/^Title:\s*(.*)$/m)?.[1] || hostOf(url)).trim();
    const body =
      raw
        .split(/^Markdown Content:\s*$/m)
        .slice(1)
        .join('\n') || raw;
    const html = mdHTML(body.trim());
    if (html.replace(/<[^>]*>/g, '').trim().length < 40) throw new Error('empty');
    return { title, html };
  } finally {
    clearTimeout(timer);
  }
}
