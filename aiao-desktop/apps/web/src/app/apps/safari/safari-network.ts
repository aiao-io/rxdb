import { cleanLead } from './safari-lead';

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
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
    title:
      new DOMParser().parseFromString(summary.titles?.display || summary.title || title, 'text/html').body
        .textContent ?? '',
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
