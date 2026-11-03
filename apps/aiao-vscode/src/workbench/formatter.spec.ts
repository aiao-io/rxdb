import { describe, expect, it } from 'vitest';
import { formatWorkbenchSource } from './formatter.js';

const formattedTs = 'const x = { a: 1 };\n';

describe('工作台源码格式化', () => {
  it('TypeScript 按仓库基线格式化：单引号、分号、无尾逗号', async () => {
    expect(await formatWorkbenchSource('src/main.ts', 'const  x={a:1,}')).toEqual({
      kind: 'formatted',
      text: formattedTs
    });
  });

  it('TSX 的 JSX 属性用单引号', async () => {
    const outcome = await formatWorkbenchSource('src/App.tsx', 'export const A=()=><div className="x"/>');
    expect(outcome.kind).toBe('formatted');
    if (outcome.kind !== 'formatted') return;
    expect(outcome.text).toContain(`className='x'`);
  });

  it('JS / JSX / JSON / CSS / HTML / Vue / Markdown / YAML 均有格式化器', async () => {
    const cases: readonly [string, string, string][] = [
      ['src/main.js', 'const  x={a:1,}', formattedTs],
      ['src/main.jsx', 'export const A=()=><div/>', 'export const A = () => <div />;\n'],
      ['src/data.json', '{"a":1}', '{ "a": 1 }\n'],
      ['src/style.css', '.a{color:red}', '.a {\n  color: red;\n}\n'],
      ['src/index.html', '<div><span>x</span></div>', '<div><span>x</span></div>\n'],
      ['src/App.vue', '<template><div>x</div></template>', '<template><div>x</div></template>\n'],
      ['README.md', '#  标题', '# 标题\n'],
      ['src/config.yaml', 'a: 1', 'a: 1\n']
    ];
    for (const [path, source, expected] of cases) {
      const outcome = await formatWorkbenchSource(path, source);
      expect(outcome, path).toEqual({ kind: 'formatted', text: expected });
    }
  });

  it('空文件与已经符合格式的内容返回 unchanged', async () => {
    expect(await formatWorkbenchSource('src/main.ts', '')).toEqual({ kind: 'unchanged' });
    expect(await formatWorkbenchSource('src/main.ts', formattedTs)).toEqual({ kind: 'unchanged' });
  });

  it('没有格式化器的扩展名返回 unsupported', async () => {
    expect(await formatWorkbenchSource('logo.svg', '<svg></svg>')).toEqual({ kind: 'unsupported' });
    expect(await formatWorkbenchSource('src/main.txt', 'hello')).toEqual({ kind: 'unsupported' });
    expect(await formatWorkbenchSource('src/main', 'hello')).toEqual({ kind: 'unsupported' });
  });

  it('语法错误原样抛出，不做降级', async () => {
    await expect(formatWorkbenchSource('src/main.ts', 'const = ;')).rejects.toThrow();
    await expect(formatWorkbenchSource('src/data.json', '{oops')).rejects.toThrow();
  });
});
