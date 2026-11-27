// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { policyViolations } from '../../testing/sanitizer';
import { NOTE_POLICY, sanitizeNoteBody } from './note-body';
import { SEED_NOTES } from './notes-data';
import { CHECKLIST_ITEM, TABLE_HTML, newNoteBody } from './notes-model';

/** 浏览器自己解析再序列化的形式：编辑区读回的 `innerHTML` 就是这个。 */
const roundTrip = (html: string): string => new DOMParser().parseFromString(html, 'text/html').body.innerHTML;

/** 改动之前的做法：库里的正文原样写进编辑区的 `innerHTML`，再读回来。 */
function assignedAsIs(body: string): string {
  const doc = document.createElement('div');
  doc.innerHTML = `<h1>T</h1>${body}`;
  return doc.innerHTML;
}

describe('sanitizeNoteBody：编辑器自己的内容不受影响', () => {
  it.each(SEED_NOTES.map(seed => [seed.title, seed.body] as const))(
    '种子笔记「%s」：消毒前后序列化逐字节一致',
    (_, body) => {
      expect(sanitizeNoteBody(body)).toBe(roundTrip(body));
    }
  );

  it('种子笔记已经是稳定形态：再消毒一次不变，所以每次打开不会被当作改动保存', () => {
    for (const seed of SEED_NOTES) {
      const once = sanitizeNoteBody(seed.body);
      expect(sanitizeNoteBody(once), seed.title).toBe(once);
      expect(policyViolations(once, NOTE_POLICY), seed.title).toEqual([]);
    }
  });

  it('除了浏览器自己补的 tbody，种子笔记消毒后与原文完全相同', () => {
    for (const seed of SEED_NOTES)
      expect(sanitizeNoteBody(seed.body).replace(/<\/?tbody>/g, ''), seed.title).toBe(seed.body);
  });

  it('新建笔记、Checklist、Table 插入的内容原样通过', () => {
    for (const html of [
      newNoteBody(new Date(2026, 6, 27, 16, 12)),
      CHECKLIST_ITEM,
      `<h1>List</h1>${CHECKLIST_ITEM}${CHECKLIST_ITEM.replace('class="todo"', 'class="todo done"')}`,
      TABLE_HTML
    ])
      expect(sanitizeNoteBody(html)).toBe(roundTrip(html));
  });

  it('execCommand 产出的格式：粗体、斜体、下划线、删除线、列表', () => {
    const html =
      '<div><b>bold</b> <i>italic</i> <u>under</u> <strike>gone</strike></div><ul><li>one</li><li>two</li></ul><div><br></div>';
    expect(sanitizeNoteBody(html)).toBe(html);
  });

  it('空正文与纯文字正文', () => {
    expect(sanitizeNoteBody('')).toBe('');
    expect(sanitizeNoteBody('plain text & more')).toBe('plain text &amp; more');
  });

  it('粘贴进来的常见内容：链接、行内样式、图片', () => {
    const html =
      '<p style="color: rgb(34, 34, 34); font-size: 14px;">see <a href="https://example.com/a?b=1">link</a> or <a href="mailto:a@example.com">mail</a></p>' +
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="shot" width="120">';
    expect(sanitizeNoteBody(html)).toBe(html);
  });
});

describe('sanitizeNoteBody：库里的正文不可信', () => {
  const evil: readonly (readonly [string, string])[] = [
    ['img onerror', '<h1>T</h1><img src=x onerror="alert(document.domain)">'],
    ['svg onload', '<h1>T</h1><svg onload="alert(1)"><circle r="1"/></svg>'],
    ['script', '<h1>T</h1><script>alert(1)</script><p>after</p>'],
    ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
    ['object / embed', '<object data="x"></object><embed src="x">'],
    ['javascript href', '<a href="javascript:alert(1)">x</a><a href="  JaVaScRiPt:alert(1)">y</a>'],
    ['data html href', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
    [
      'form',
      '<form action="https://evil.example/"><input name="q"><button formaction="javascript:alert(1)">go</button></form>'
    ],
    [
      'link / meta / base',
      '<link rel="prefetch" href="x"><meta http-equiv="refresh" content="0"><base href="https://evil.example/">'
    ],
    [
      'inline style',
      '<p style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:url(javascript:alert(1))">x</p>'
    ],
    ['style element', '<style>*{display:none}</style><p>x</p>'],
    [
      'math mXSS',
      '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=alert(1)&gt;">'
    ],
    ['noscript mXSS', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">x</p></noscript>'],
    ['event on allowed tag', '<b onmouseover="alert(1)" onclick="alert(2)" class="todo" id="stage" data-x="1">x</b>'],
    ['contenteditable', '<div contenteditable="true">x</div><i contenteditable="true"></i>'],
    ['comment', '<!--[if gte IE 4]><script>alert(1)</script><![endif]--><p>x</p>'],
    ['relative image', '<img src="/steal?x" onerror="alert(1)"><img src="//evil.example/x.png">']
  ];

  it.each(evil)('%s：结果只剩白名单内的东西，再消毒一次不变', (_, body) => {
    const clean = sanitizeNoteBody(`<h1>T</h1>${body}`);
    expect(policyViolations(clean, NOTE_POLICY), clean).toEqual([]);
    expect(sanitizeNoteBody(clean)).toBe(clean);
  });

  /** 注释本身不是活动内容，删掉它是因为它是变异 XSS 的载体；其余载荷都是真的。 */
  const live = evil.filter(([name]) => name !== 'comment');

  it.each(live)('对照 %s：原样写进 innerHTML（改动之前）时载荷确实在', (_, body) => {
    expect(policyViolations(assignedAsIs(body), NOTE_POLICY)).not.toEqual([]);
  });

  it('危险载荷被剥干净，正常的部分留下', () => {
    expect(sanitizeNoteBody('<h1>T</h1><img src=x onerror="alert(1)"><p>keep</p>')).toBe('<h1>T</h1><img><p>keep</p>');
    expect(sanitizeNoteBody('<p>a</p><script>alert(1)</script><p>b</p>')).toBe('<p>a</p><p>b</p>');
    expect(sanitizeNoteBody('<a href="javascript:alert(1)" onclick="x()">go</a>')).toBe('<a>go</a>');
    expect(sanitizeNoteBody('<p style="color:red;position:fixed;top:0">x</p>')).toBe('<p style="color:red">x</p>');
    expect(sanitizeNoteBody('<b onclick="x()" class="todo bogus" id="a">x</b>')).toBe('<b class="todo">x</b>');
    expect(sanitizeNoteBody('<div><i contenteditable="false"></i><i contenteditable="true"></i></div>')).toBe(
      '<div><i contenteditable="false"></i><i></i></div>'
    );
  });

  it('表单、嵌入内容、外部资源与外来命名空间的元素一个都不留', () => {
    expect(
      sanitizeNoteBody(
        '<form action="https://evil.example/"><input name="q"><button formaction="javascript:alert(1)">go</button></form>'
      )
    ).toBe('go');
    expect(
      sanitizeNoteBody(
        '<iframe srcdoc="x"></iframe><object data="x"></object><embed src="x"><svg onload="1"></svg><math><mi>x</mi></math>' +
          '<link rel="prefetch" href="x"><meta charset="x"><base href="x"><script>1</script><style>p{}</style>'
      )
    ).toBe('');
  });

  it('不是白名单的元素展开，文字不丢', () => {
    expect(sanitizeNoteBody('<section><h2>Head</h2><font color="red">red</font> <center>mid</center></section>')).toBe(
      '<h2>Head</h2>red mid'
    );
  });

  it('允许的链接协议与图片来源', () => {
    expect(sanitizeNoteBody('<a href="http://example.com/">a</a><a href="tel:+8613800000000">b</a>')).toBe(
      '<a href="http://example.com/">a</a><a href="tel:+8613800000000">b</a>'
    );
    expect(
      sanitizeNoteBody('<img src="https://example.com/a.png"><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">')
    ).toBe('<img src="https://example.com/a.png"><img>');
  });
});
