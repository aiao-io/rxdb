/**
 * HTML 白名单净化：把不可信的 HTML 变成只含白名单内元素与属性的 HTML，用于要写进 `innerHTML`、
 * 或要绕过 Angular 内置消毒器（它会删掉 `data-*`）的片段。
 *
 * 做法是惰性解析（`DOMParser` 产出的文档没有浏览上下文：不执行脚本、不加载图片、事件属性不会触发）、
 * 就地删改、再序列化，所以结果和浏览器自己解析再序列化的形式一致，只少了白名单之外的东西。输出里不会有
 * 脚本、样式、嵌入内容、表单控件、外来命名空间（`svg`、`math` 要用得显式列进白名单）、注释这些会改变解析方式的内容，
 * 重新解析时就没有可供变异（mXSS）的原始文本元素；属性只有登记过规则的才保留，`on*`、`id`、`name`、`data-*`、命名空间属性默认全无。
 */

/** 属性取值规则：返回净化后的取值（可以与原值相同），`null` 表示整个属性丢弃。 */
export type AttributeRule = (value: string) => string | null;

/** 属性名（小写）到取值规则。 */
export type AttributeRules = Readonly<Record<string, AttributeRule>>;

/**
 * 输出白名单。只有 `elements` 里的元素会出现在结果里；属性只认该元素专属的规则与 `attributes` 里的通用规则。
 * 不在表里的元素展开成它的子节点（文字留下）；脚本、样式、嵌入内容这类本身就不是正文的元素连同内容一起丢弃。
 */
export interface HtmlPolicy {
  /** 允许输出的元素（小写名字）及其专属的属性规则。 */
  readonly elements: Readonly<Record<string, AttributeRules>>;
  /** 每个允许输出的元素都能带的属性规则。 */
  readonly attributes: AttributeRules;
}

/**
 * 连同内容整棵丢弃的元素：脚本与样式、改变解析方式的原始文本元素、嵌入内容与外部资源、表单控件、外来命名空间的根。
 * 白名单里列出的元素优先，所以需要 `math` 的策略把它列进 `elements` 即可。
 */
const DISCARDED: ReadonlySet<string> = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'noembed',
  'noframes',
  'plaintext',
  'xmp',
  'title',
  'head',
  'textarea',
  'select',
  'option',
  'optgroup',
  'datalist',
  'input',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'param',
  'portal',
  'fencedframe',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'link',
  'meta',
  'base',
  'bgsound',
  'svg',
  'math',
  'annotation',
  'annotation-xml'
]);

/** 声明一批没有专属属性的元素：`plainElements('p div span')`。 */
export function plainElements(names: string): Record<string, AttributeRules> {
  return Object.fromEntries(names.split(/\s+/).map(name => [name, {}]));
}

/** 取值原样放行。 */
export const anyValue: AttributeRule = value => value;

/** 整个取值满足 `pattern`（不要带 `g` 标志）才保留。 */
export const matching =
  (pattern: RegExp): AttributeRule =>
  value =>
    pattern.test(value) ? value : null;

const CLASS_TOKEN = /^[\w-]+$/;

/**
 * 类名规则：只保留 `allowed` 里的类名；不给白名单时保留由字母、数字、下划线与连字符组成的类名。
 * 类名都合格就原样返回，一个都不剩就删掉整个属性。
 */
export const classTokens =
  (allowed?: readonly string[]): AttributeRule =>
  value => {
    const tokens = value.split(/\s+/).filter(Boolean);
    const kept = tokens.filter(token => (allowed ? allowed.includes(token) : CLASS_TOKEN.test(token)));
    if (!kept.length) return null;
    return kept.length === tokens.length ? value : kept.join(' ');
  };

/** 绝对地址且协议在 `protocols` 里（带冒号，如 `https:`）；相对地址、`javascript:`、`data:` 与解析不了的都拒绝。 */
export const absoluteUrl =
  (protocols: readonly string[]): AttributeRule =>
  value =>
    URL.canParse(value) && protocols.includes(new URL(value).protocol) ? value : null;

/**
 * 内联样式里允许的属性：排版、颜色、边距与边框这类只影响元素自身外观的。没有定位、层级、变换、尺寸、
 * 内容、滤镜、光标与任何会取外部资源的属性，所以放进去的内容出不了它所在的容器，也盖不住界面。
 */
const STYLE_PROPERTIES: ReadonlySet<string> = new Set(
  `background background-color border border-bottom border-color border-left border-radius border-right border-style
   border-top border-width color display font font-family font-size font-style font-variant font-weight letter-spacing
   line-height margin margin-bottom margin-left margin-right margin-top padding padding-bottom padding-left
   padding-right padding-top text-align text-decoration text-indent text-transform vertical-align white-space
   word-spacing`.split(/\s+/)
);

/** 取值里允许出现的函数：不取外部资源、不执行表达式的那几个。 */
const STYLE_FUNCTIONS: ReadonlySet<string> = new Set(['var', 'rgb', 'rgba', 'hsl', 'hsla', 'calc']);

/** 取值只允许字母、数字、空白与 `. , % # ( ) + - * / ! _`：没有引号、反斜杠、冒号、分号、花括号、`@`、尖括号。 */
const STYLE_VALUE = /^[\p{L}\p{N}\s.,%#()+\-*/!_]+$/u;

/**
 * 逐个单词扫描，单词后面（可隔空白）紧跟左括号的就是函数调用。左括号是可选的，所以任何输入都不会回溯：
 * 写成 `/(单词)\s*\(/` 的话，一个没有括号的超长单词会让每个起点都扫一遍整个单词，时间是二次方的。
 */
const FUNCTION_CALL = /([\p{L}\p{N}_-]+)\s*(\()?/gu;

function styleDeclaration(segment: string): string | null {
  const colon = segment.indexOf(':');
  if (colon < 0) return null;
  const property = segment.slice(0, colon).trim().toLowerCase();
  const value = segment.slice(colon + 1).trim();
  if (!STYLE_PROPERTIES.has(property) || !STYLE_VALUE.test(value) || value.includes('/*')) return null;
  const functions = [...value.matchAll(FUNCTION_CALL)].filter(match => match[2]).map(match => match[1].toLowerCase());
  return functions.every(name => STYLE_FUNCTIONS.has(name)) ? `${property}:${value}` : null;
}

/**
 * `style` 属性规则：逐条声明检查，只留下属性与取值都在白名单里的。全部合格就原样返回（字节不变），
 * 否则返回留下的声明，一条都不剩就删掉整个属性。
 */
export const safeStyle: AttributeRule = value => {
  const segments = value
    .split(';')
    .map(segment => segment.trim())
    .filter(Boolean);
  const kept = segments.flatMap(segment => styleDeclaration(segment) ?? []);
  if (!kept.length) return null;
  return kept.length === segments.length ? value : kept.join(';');
};

const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** `attribute` 在 `element` 上适用的规则：先看元素专属的，再看通用的；元素或属性不在白名单里时是 `undefined`。 */
export function ruleFor(policy: HtmlPolicy, element: string, attribute: string): AttributeRule | undefined {
  const rules = own(policy.elements, element);
  return rules && (own(rules, attribute) ?? own(policy.attributes, attribute));
}

function filterAttributes(element: Element, policy: HtmlPolicy): void {
  for (const attribute of [...element.attributes]) {
    const value = ruleFor(policy, element.localName, attribute.name)?.(attribute.value) ?? null;
    if (value === null) element.removeAttribute(attribute.name);
    else if (value !== attribute.value) element.setAttribute(attribute.name, value);
  }
}

/**
 * 一个元素最多带多少个属性才处理。正常的 HTML 最多十来个；浏览器遍历、删除元素属性的代价是属性个数的二次方
 * （十万个属性要卡住半分钟），所以更多的当作未知元素展开，不去逐个检查它的属性。
 */
const MAX_ATTRIBUTES = 64;

/** `NodeFilter.SHOW_COMMENT`：写成常量，不依赖测试里只替换了 `DOMParser` 的环境有没有 `NodeFilter` 这个全局。 */
const SHOW_COMMENT = 0x80;

/** 元素换成它的子节点。逐个搬而不是 `replaceWith(...childNodes)`：子节点多到几十万个时展开参数会爆栈。 */
function unwrap(element: Element): void {
  while (element.firstChild) element.before(element.firstChild);
  element.remove();
}

function clean(element: Element, policy: HtmlPolicy): void {
  const name = element.localName;
  if (Object.hasOwn(policy.elements, name) && element.attributes.length <= MAX_ATTRIBUTES)
    filterAttributes(element, policy);
  else if (DISCARDED.has(name)) element.remove();
  else unwrap(element);
}

/**
 * 就地净化 `root` 的所有后代（`root` 自己不动）。从文档顺序的末尾往前处理，每个元素处理时它的后代都已处理完，
 * 展开或丢弃一个元素不会漏掉任何节点。
 */
export function sanitizeTree(root: Element, policy: HtmlPolicy): void {
  for (const element of [...root.querySelectorAll('*')].reverse()) clean(element, policy);
  const walker = root.ownerDocument.createTreeWalker(root, SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) comment.parentNode?.removeChild(comment);
}

/** 解析 `html`，按 `policy` 净化，返回序列化结果。 */
export function sanitizeHtml(html: string, policy: HtmlPolicy): string {
  const { body } = new DOMParser().parseFromString(html, 'text/html');
  sanitizeTree(body, policy);
  return body.innerHTML;
}
