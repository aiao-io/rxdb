import {
  absoluteUrl,
  anyValue,
  classTokens,
  matching,
  plainElements,
  safeStyle,
  sanitizeTree,
  type AttributeRule,
  type AttributeRules,
  type HtmlPolicy
} from '../../shared/html-sanitizer';

const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';

const startingWith =
  (prefix: string): AttributeRule =>
  value =>
    value.startsWith(prefix) ? value : null;

const size = matching(/^\d{1,4}$/);
const httpsImage = absoluteUrl(['https:']);

/** 协议相对的图片地址（`//upload…`）钉成 https；其余不是 https 的地址（相对、`http:`、`data:`、`javascript:`）一律没有 src。 */
const imageSource: AttributeRule = value => httpsImage(value.startsWith('//') ? `https:${value}` : value);

/** MathML 展示属性的取值：关键字、数字与长度（`true`、`0.167em`、`-0.4em`、`left center`），没有括号、引号、冒号与分号。 */
const MATHML_VALUE = matching(/^[\w.%\- ]{1,40}$/);

const MATHML_ATTRIBUTES: AttributeRules = {
  xmlns: value => (value === MATHML_NAMESPACE ? value : null),
  ...Object.fromEntries(
    `display displaystyle scriptlevel mathvariant stretchy fence separator form lspace rspace largeop movablelimits
     symmetric accent accentunder linethickness width height depth voffset columnspan rowspan columnalign rowalign
     data-mjx-texclass`
      .split(/\s+/)
      .map(name => [name, MATHML_VALUE])
  )
};

/** MathML Core 的展示元素。没有 `annotation`、`annotation-xml`、`mglyph`、`maction` 与带链接的元素。 */
const MATHML_ELEMENTS = Object.fromEntries(
  `math mfrac mi mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms mspace msqrt mstyle msub msubsup
   msup mtable mtd mtext mtr munder munderover none semantics`
    .split(/\s+/)
    .map(name => [name, MATHML_ATTRIBUTES])
);

/**
 * 导语的白名单：正文用到的排版元素、站内链接、https 图片与 MathML 公式。属性只有 class、行内样式（见 `safeStyle`）、
 * title、lang、dir，加上 `a` 上只能指向维基条目的 `data-goto`。没有 `id`、`name`、`data-openext`、`data-tryframe`、事件属性，
 * 也没有脚本、框架、表单与外来命名空间。
 */
export const LEAD_POLICY: HtmlPolicy = {
  elements: {
    ...plainElements(
      'abbr b bdi bdo big blockquote br center cite code dd del dfn div dl dt em h1 h2 h3 h4 h5 h6 hr i ins kbd li mark ' +
        'ol p pre q rp rt ruby s samp small span strike strong sub sup time tt u ul var wbr'
    ),
    a: { href: startingWith('/wiki/'), 'data-goto': startingWith('en.wikipedia.org/wiki/') },
    img: { src: imageSource, alt: anyValue, width: size, height: size },
    ...MATHML_ELEMENTS
  },
  attributes: {
    class: classTokens(),
    style: safeStyle,
    title: anyValue,
    lang: matching(/^[A-Za-z0-9-]{1,35}$/),
    dir: matching(/^(?:ltr|rtl|auto)$/)
  }
};

/** 导语里不要的噪音：样式脚本、编辑链接、脚注、提示条、导航框、表格、图与缩略图。 */
const NOISE = 'style,script,.mw-editsection,.reference,sup.reference,.hatnote,.navbox,table,figure,.thumb';

/**
 * 只取导语里的正文：去掉表格、脚注等噪音，再按 `LEAD_POLICY` 重建（元素与属性白名单，见 `sanitizeTree`）；
 * 站内链接改成 `data-goto` 在本浏览器里导航，其余链接只剩文字；协议相对的图片地址钉成 https，没有 srcset。
 * 来源是任何人都能编辑的维基页面，结果要绕过 Angular 的消毒器直接注入，所以不能靠黑名单。
 */
export function cleanLead(html: string): string {
  const { body } = new DOMParser().parseFromString(html, 'text/html');
  body.querySelectorAll(NOISE).forEach(node => node.remove());
  sanitizeTree(body, LEAD_POLICY);
  body.querySelectorAll('a[href]').forEach(link => {
    link.setAttribute('data-goto', `en.wikipedia.org${link.getAttribute('href')}`);
    link.removeAttribute('href');
  });
  return body.innerHTML;
}
