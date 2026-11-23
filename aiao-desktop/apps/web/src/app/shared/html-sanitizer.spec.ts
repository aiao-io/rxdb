// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { policyViolations } from '../testing/sanitizer';
import {
  absoluteUrl,
  anyValue,
  classTokens,
  matching,
  plainElements,
  safeStyle,
  sanitizeHtml,
  type HtmlPolicy
} from './html-sanitizer';

const POLICY: HtmlPolicy = {
  elements: {
    ...plainElements('p div span b i br ul li'),
    a: { href: absoluteUrl(['https:', 'mailto:']) },
    img: { src: absoluteUrl(['https:']), alt: anyValue }
  },
  attributes: { class: classTokens(['ok', 'todo']), style: safeStyle, title: anyValue }
};

const clean = (html: string): string => sanitizeHtml(html, POLICY);

afterEach(() => vi.restoreAllMocks());

describe('sanitizeHtml：元素', () => {
  it('白名单里的元素、文字与空白原样保留（序列化与浏览器自己解析再序列化一致）', () => {
    const html =
      '<p>Hello <b>big</b> <i>world</i></p>\n<ul><li>one</li><li>two<br></li></ul>\n<div>a &amp; b &lt; c&nbsp;d</div>';
    expect(clean(html)).toBe(html);
  });

  it('不在白名单的普通元素展开：子节点留下，元素本身消失', () => {
    expect(clean('<section><p>a</p><center>b <font color="red">c</font></center></section>')).toBe('<p>a</p>b c');
  });

  it('展开发生在每一层：嵌套的未登记元素全部消失，登记过的夹在中间仍保留', () => {
    expect(clean('<x-a><x-b><b>keep</b></x-b>tail</x-a>')).toBe('<b>keep</b>tail');
  });

  it('展开子节点很多的元素时，不把它们当成一次调用的参数（引擎对参数个数有上限，十几万个就爆栈）', () => {
    const limit = 5_000;
    for (const method of ['replaceWith', 'before', 'after', 'append', 'prepend'] as const) {
      const original = Element.prototype[method] as (...nodes: unknown[]) => void;
      vi.spyOn(Element.prototype, method).mockImplementation(function (this: Element, ...nodes: unknown[]) {
        if (nodes.length > limit) throw new RangeError('Maximum call stack size exceeded');
        original.apply(this, nodes);
      });
    }
    const children = '<!---->'.repeat(limit + 1_000);
    expect(clean(`<x-a>${children}<b>keep</b>${children}</x-a>`)).toBe('<b>keep</b>');
  });

  it('脚本、样式、嵌入内容、表单控件与外来命名空间的根整棵丢弃，连里面的文字', () => {
    const dropped = [
      '<script>alert(1)</script>',
      '<style>p{color:red}</style>',
      '<template><p>t</p></template>',
      '<noscript><p>n</p></noscript>',
      '<iframe src="x" srcdoc="<script>alert(1)</script>"></iframe>',
      '<frameset><frame src="javascript:alert(1)"></frameset>',
      '<object data="x"><param name="a" value="b"></object>',
      '<embed src="x">',
      '<svg><a xlink:href="javascript:alert(1)"><text>t</text></a></svg>',
      '<math><mi>x</mi></math>',
      '<form action="https://evil.example/"><input name="q"><select><option>o</option></select></form>',
      '<textarea>t</textarea>',
      '<link rel="prefetch" href="x.css">',
      '<meta http-equiv="refresh" content="0;url=https://evil.example/">',
      '<base href="https://evil.example/">',
      '<audio src="x"></audio>',
      '<video src="x"></video>',
      '<title>t</title>'
    ];
    for (const html of dropped) expect(clean(`<p>a</p>${html}<p>b</p>`), html).toBe('<p>a</p><p>b</p>');
  });

  it('注释被删掉，包括条件注释与元素里的注释', () => {
    expect(clean('<!--[if IE]><p>x</p><![endif]--><p>a<!-- c -->b<b><!--d--></b></p>')).toBe('<p>ab<b></b></p>');
  });

  it('元素名取自原型链（constructor）也不会被当成白名单成员', () => {
    expect(clean('<constructor onclick="x()">a</constructor>')).toBe('a');
  });
});

describe('sanitizeHtml：属性', () => {
  it('事件属性、未登记的属性与 data-*、id、name 一律删除', () => {
    expect(
      clean('<p onclick="x()" onmouseover=x id="a" name="b" data-goto="evil" style="" accesskey="x" class="ok">t</p>')
    ).toBe('<p class="ok">t</p>');
  });

  it('属性按「元素专属规则，再通用规则」判断：a 的 href 只收登记过的协议', () => {
    expect(clean('<a href="https://example.com/x" title="t" target="_blank" rel="opener">l</a>')).toBe(
      '<a href="https://example.com/x" title="t">l</a>'
    );
    expect(clean('<a href="javascript:alert(1)">l</a>')).toBe('<a>l</a>');
    expect(clean('<a href="mailto:a@example.com">l</a>')).toBe('<a href="mailto:a@example.com">l</a>');
  });

  it('同一个属性名在不同元素上规则不同：src 只在 img 上有', () => {
    expect(
      clean('<img src="https://example.com/a.png" alt="x" onerror="alert(1)"><b src="https://example.com/a.png">t</b>')
    ).toBe('<img src="https://example.com/a.png" alt="x"><b>t</b>');
  });

  it('属性名取自原型链（constructor、__proto__）也不会被当成规则', () => {
    expect(clean('<p constructor="x" __proto__="y" class="ok">t</p>')).toBe('<p class="ok">t</p>');
  });

  it('规则可以改写取值：返回新值就替换，返回 null 就整个删掉', () => {
    const policy: HtmlPolicy = {
      elements: { p: { title: value => value.toUpperCase(), lang: () => null } },
      attributes: {}
    };
    expect(sanitizeHtml('<p title="abc" lang="en">t</p>', policy)).toBe('<p title="ABC">t</p>');
  });

  it('属性多得离谱的元素当作未知元素展开：浏览器逐个删属性是二次方的，十万个属性能卡住半分钟', () => {
    const many = Array.from({ length: 200 }, (_, i) => `a${i}="1"`).join(' ');
    expect(clean(`<p ${many} class="ok">t</p>`)).toBe('t');
    const fine = Array.from({ length: 60 }, (_, i) => `a${i}="1"`).join(' ');
    expect(clean(`<p ${fine} class="ok">t</p>`)).toBe('<p class="ok">t</p>');
  });

  it('命名空间属性（xlink:href、xml:lang）不是白名单成员', () => {
    expect(clean('<p xml:lang="en" xlink:href="javascript:alert(1)" class="ok">t</p>')).toBe('<p class="ok">t</p>');
  });

  it('body 上的属性不会混进结果', () => {
    expect(clean('<body onload="alert(1)"><p>t</p></body>')).toBe('<p>t</p>');
  });
});

describe('净化结果满足白名单不变量，且再净化一次不变', () => {
  const payloads = [
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)><circle/></svg>',
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    '<a href=" javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
    '<div style="background:url(javascript:alert(1))">x</div>',
    '<div style="width:expression(alert(1))">x</div>',
    '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:red">x</div>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=alert(1)&gt;">',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">x</p></noscript>',
    '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
    '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
    '<table><caption><svg><style><img src=x onerror=alert(1)></style></svg></caption></table>',
    '<select><option><style></select><img src=x onerror=alert(1)>',
    '<textarea><img src=x onerror=alert(1)></textarea>',
    '<xmp><img src=x onerror=alert(1)></xmp>',
    '<p title="a&quot;onmouseover=&quot;alert(1)">x</p>',
    '<p class="ok&quot; onclick=&quot;alert(1)">x</p>',
    '<b><b><b><b>deep</b></b></b></b>'
  ];

  it.each(payloads)('%s', payload => {
    const once = clean(payload);
    expect(policyViolations(once, POLICY), once).toEqual([]);
    expect(clean(once)).toBe(once);
  });
});

describe('classTokens', () => {
  it('全部在白名单里就原样返回（含原有的空白）', () => {
    expect(classTokens(['a', 'b'])('a  b')).toBe('a  b');
  });

  it('丢掉白名单之外的类名；一个都不剩就删掉整个属性', () => {
    expect(classTokens(['a', 'b'])('a c b')).toBe('a b');
    expect(classTokens(['a'])('c d')).toBeNull();
    expect(classTokens(['a'])('')).toBeNull();
  });

  it('不给白名单时只收由字母、数字、下划线与连字符组成的类名', () => {
    expect(classTokens()('mw-content-ltr mw-parser-output IPA_x "bad bad>')).toBe(
      'mw-content-ltr mw-parser-output IPA_x'
    );
  });
});

describe('safeStyle', () => {
  it('种子笔记里用到的声明全部放行，且字节不变', () => {
    const style =
      'font-family:var(--font-mono);font-size:12.5px;background:var(--fill);padding:9px 12px;border-radius:7px';
    expect(safeStyle(style)).toBe(style);
  });

  it('真实页面里常见的写法：display:none、颜色、边框、字号', () => {
    for (const style of [
      'display:none',
      'display:none;',
      'display: inline-block; margin-bottom: -0.3em; vertical-align: -0.4em; line-height: 1em; font-size: 80%; text-align: left',
      'border-bottom:1px dotted',
      'color: rgb(34, 34, 34); background-color: #f8f9fa',
      'white-space: nowrap;'
    ])
      expect(safeStyle(style), style).toBe(style);
  });

  it('只去掉不安全的声明，保留其余的', () => {
    expect(safeStyle('color:red;position:fixed;top:0;font-size:12px')).toBe('color:red;font-size:12px');
  });

  it('不在属性白名单里的整条丢掉：定位、层级、变换、内容、滤镜、光标、内部属性', () => {
    for (const declaration of [
      'position:absolute',
      'z-index:9999',
      'transform:scale(3)',
      'content:"x"',
      'filter:blur(2px)',
      'cursor:url(x),auto',
      '-moz-binding:url(x)',
      'behavior:url(x)',
      'inset:0',
      'width:100vw',
      'list-style-image:url(x)'
    ])
      expect(safeStyle(declaration), declaration).toBeNull();
  });

  it('白名单属性里带不安全的值也丢：url()、expression()、image-set()、转义、@import、引号、注释', () => {
    for (const declaration of [
      'background:url(javascript:alert(1))',
      'background:URL(x)',
      'background:url (x)',
      'background-color:expression(alert(1))',
      'background:image-set("x" 1x)',
      'background:u\\72l(x)',
      'color:red\\;position:fixed',
      'font-family:"a"',
      "font-family:'a'",
      'color:red/*x*/',
      'color:@import',
      'color:red}body{display:none',
      'color:<red>'
    ])
      expect(safeStyle(declaration), declaration).toBeNull();
  });

  it('函数只放行 var、rgb(a)、hsl(a)、calc', () => {
    expect(safeStyle('margin-top:calc(1px + 2px)')).toBe('margin-top:calc(1px + 2px)');
    expect(safeStyle('color:hsla(0, 0%, 0%, 0.5)')).toBe('color:hsla(0, 0%, 0%, 0.5)');
    expect(safeStyle('color:attr(x)')).toBeNull();
    expect(safeStyle('color:env(x)')).toBeNull();
  });

  it('取值再长也是线性时间：一个没有括号的超长单词不能把页面拖死', () => {
    const started = performance.now();
    expect(safeStyle(`color:${'a'.repeat(40_000)}`)).not.toBeNull();
    expect(safeStyle(`color:${'a(b'.repeat(15_000)}`)).toBeNull();
    expect(safeStyle(`margin:${'1 '.repeat(40_000)}`)).not.toBeNull();
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('属性名不分大小写；没有冒号、没有值的片段与空串都算无效', () => {
    expect(safeStyle('COLOR: Red')).toBe('COLOR: Red');
    expect(safeStyle('color')).toBeNull();
    expect(safeStyle('color:')).toBeNull();
    expect(safeStyle('')).toBeNull();
    expect(safeStyle(';;')).toBeNull();
  });
});

describe('absoluteUrl', () => {
  const https = absoluteUrl(['https:']);

  it('协议在白名单内的绝对地址原样放行，协议不分大小写', () => {
    expect(https('https://example.com/a?b#c')).toBe('https://example.com/a?b#c');
    expect(https('HTTPS://EXAMPLE.COM/')).toBe('HTTPS://EXAMPLE.COM/');
  });

  it('其余全部拒绝：相对地址、协议相对地址、javascript、data、混淆写法、解析不了的地址', () => {
    for (const value of [
      '/path',
      'path',
      '//example.com/x',
      'http://example.com/',
      'javascript:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'vbscript:x',
      'data:text/html,x',
      'blob:https://example.com/x',
      'https://exa mple.com/',
      ''
    ])
      expect(https(value), JSON.stringify(value)).toBeNull();
  });
});

describe('matching', () => {
  it('整个取值满足正则才保留', () => {
    const digits = matching(/^\d{1,3}$/);
    expect(digits('42')).toBe('42');
    expect(digits('4 2')).toBeNull();
    expect(digits('1234')).toBeNull();
    expect(digits('')).toBeNull();
  });
});
