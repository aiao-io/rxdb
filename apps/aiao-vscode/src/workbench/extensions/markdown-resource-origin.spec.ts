import { describe, expect, it } from 'vitest';
import { isTikzResource } from './markdown-resource-origin.js';

describe('Markdown 验证资源来源', () => {
  it.each(['https://tikzjax.com/v1/tikzjax.js', 'https://tikzjax.com:443/fonts.css'])('识别 TikZ 资源 %s', url =>
    expect(isTikzResource(url)).toBe(true)
  );

  it.each([
    'https://tikzjax.com.attacker.test/script.js',
    'https://tikzjax.com@attacker.test/script.js',
    'https://attacker.test/tikzjax.com',
    'https://attacker.test/?url=https://tikzjax.com/',
    'http://tikzjax.com/script.js',
    'https://tikzjax.com:444/script.js',
    'not a URL containing tikzjax.com',
    ''
  ])('不把其他来源 %s 归为 TikZ 限制', url => expect(isTikzResource(url)).toBe(false));
});
