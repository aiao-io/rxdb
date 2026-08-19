import { describe, expect, it } from 'vitest';
import { rewriteShadowCss } from '../../@browser/shadow-css.js';

describe('rewriteShadowCss', () => {
  describe(':root → :host', () => {
    it('把 :root 改写成 :host，让规则落到有布局盒的宿主元素上', () => {
      expect(rewriteShadowCss(':root{--color-primary:red}')).toBe(':host{--color-primary:red}');
    });

    it('不留下任何 :root（Shadow DOM 里 :root 匹配不到东西）', () => {
      expect(rewriteShadowCss(':root{background-color:var(--root-bg)}')).not.toMatch(/:root/);
    });

    it('daisyUI 的 :is(:host, :root) 折叠后仍然命中宿主', () => {
      const out = rewriteShadowCss(':is(:host, :root):not([data-theme]){color-scheme:light}');
      expect(out).not.toMatch(/:root/);
      expect(out).toMatch(/:host/);
    });
  });

  describe('具名主题下发到宿主元素', () => {
    it('给 [data-theme=X] 补一份 :host([data-theme=X])', () => {
      const out = rewriteShadowCss('[data-theme=dark]{--color-base-100:black}');
      expect(out).toBe(':host([data-theme=dark]),[data-theme=dark]{--color-base-100:black}');
    });

    it('保留原选择器，独立打开子应用时 shadow 内的 <html> 依然生效', () => {
      const out = rewriteShadowCss('[data-theme=light]{--color-base-100:white}');
      expect(out).toMatch(/\[data-theme=light\]\{/);
    });

    it('后代选择器只在前缀处扩展，不会被逗号截断成独立规则', () => {
      const out = rewriteShadowCss('[data-theme=light] .text-error{color:red}');
      expect(out).toBe(':host([data-theme=light]) .text-error,[data-theme=light] .text-error{color:red}');
    });

    it('不给非前缀位置的 [data-theme] 加 :host（那会把规则错误地提升到宿主）', () => {
      const out = rewriteShadowCss('.wrap [data-theme=dark]{color:red}');
      expect(out).toBe('.wrap [data-theme=dark]{color:red}');
    });

    it('处理 daisyUI 真实产物：:has() 分支 + 具名主题分支', () => {
      const input =
        ':is(:host,:root):has(input.theme-controller[value=dark]:checked),[data-theme=dark]{color-scheme:dark;--color-base-100:oklch(25.33% .016 252.42)}';
      const out = rewriteShadowCss(input);
      expect(out).toMatch(/:host\(\[data-theme=dark\]\)/);
      expect(out).not.toMatch(/:root/);
    });

    it('支持带引号的属性值', () => {
      const out = rewriteShadowCss('[data-theme="dark"]{color:white}');
      expect(out).toBe(':host([data-theme="dark"]),[data-theme="dark"]{color:white}');
    });
  });

  describe('不破坏 at-rule 与非选择器内容', () => {
    it('@media 内部的具名主题照常扩展，@media 本身不动', () => {
      const out = rewriteShadowCss('@media (prefers-color-scheme:dark){[data-theme=dark]{color:white}}');
      expect(out).toBe(
        '@media (prefers-color-scheme:dark){:host([data-theme=dark]),[data-theme=dark]{color:white}}'
      );
    });

    it('@property 块不被当作选择器改写', () => {
      const input = '@property --tw-blur{syntax:"*";inherits:false;}';
      expect(rewriteShadowCss(input)).toBe(input);
    });

    it('@layer 声明保持原样', () => {
      const input = '@layer theme,base,components,utilities;';
      expect(rewriteShadowCss(input)).toBe(input);
    });

    it('@keyframes 的百分比关键帧不被加 :host', () => {
      const input = '@keyframes spin{0%,to{--page-has-scroll: }}';
      expect(rewriteShadowCss(input)).toBe(input);
    });

    it('url() 里的内容不受影响', () => {
      const input = ':root{--fx-noise:url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\'%3E%3C/svg%3E")}';
      const out = rewriteShadowCss(input);
      expect(out).toMatch(/^:host\{/);
      expect(out).toMatch(/data:image\/svg\+xml/);
    });
  });

  it('幂等：重复改写不会叠加 :host(...)', () => {
    const once = rewriteShadowCss('[data-theme=dark]{color:white}');
    expect(rewriteShadowCss(once)).toBe(once);
  });
});
