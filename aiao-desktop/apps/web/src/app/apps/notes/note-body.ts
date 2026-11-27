import {
  absoluteUrl,
  anyValue,
  classTokens,
  matching,
  plainElements,
  safeStyle,
  sanitizeHtml,
  type AttributeRule,
  type HtmlPolicy
} from '../../shared/html-sanitizer';

/** 编辑区自己用到的类名：待办行、已完成、日期行。 */
const NOTE_CLASSES = ['todo', 'done', 'date'] as const;

const HTTPS_IMAGE = absoluteUrl(['https:']);
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i;

/** 图片只收 https 地址与光栅图的 base64 `data:`（粘贴截图就是这种）；相对地址会向桌面自己的源发请求，SVG 能带脚本。 */
const imageSource: AttributeRule = value => HTTPS_IMAGE(value) ?? (DATA_IMAGE.test(value) ? value : null);

const size = matching(/^\d{1,4}$/);
const spanCount = matching(/^\d{1,3}$/);
const cell = { colspan: spanCount, rowspan: spanCount };

/**
 * 笔记正文的白名单：编辑器自己产出的内容（`execCommand` 的粗体、斜体、下划线、删除线与列表，
 * 待办行 `<div class="todo"><i contenteditable="false">`，表格，标题与日期行）加上粘贴常见的链接、图片与行内样式。
 * 没有 `id`、`name`、`data-*`、事件属性，没有脚本、样式、表单、嵌入内容与外来命名空间。
 */
export const NOTE_POLICY: HtmlPolicy = {
  elements: {
    ...plainElements(
      'h1 h2 h3 h4 h5 h6 p div span br hr b strong i em u s strike del ins sub sup small mark code pre blockquote ' +
        'ul ol li table thead tbody tfoot tr caption'
    ),
    i: { contenteditable: matching(/^false$/) },
    a: { href: absoluteUrl(['http:', 'https:', 'mailto:', 'tel:']) },
    img: { src: imageSource, alt: anyValue, width: size, height: size },
    td: cell,
    th: cell
  },
  attributes: { class: classTokens(NOTE_CLASSES), style: safeStyle }
};

/**
 * 把库里的笔记正文变成可以放进编辑区 `innerHTML` 的 HTML。正文不只来自这个编辑器：恢复别人给的备份、同源的其他代码
 * 也能写库，渲染是存储型 XSS 的汇点，所以进编辑区之前一律走白名单。编辑器自己产出的正文消毒前后序列化逐字节一致
 * （浏览器自己补的 `tbody` 之类除外，那是任何一次 `innerHTML` 往返都会有的），打开笔记不会因此被当作改动保存。
 */
export function sanitizeNoteBody(body: string): string {
  return sanitizeHtml(body, NOTE_POLICY);
}
