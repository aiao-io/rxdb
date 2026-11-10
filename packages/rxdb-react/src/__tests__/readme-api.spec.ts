/**
 * README 的查询 API 清单与包入口对账（RV-01a1bb334b9b）。
 *
 * @remarks
 * 消费者照 README 的清单导入，清单里有、入口里没有的名字会在编译或 ESM 加载时失败。
 * 规则：列表项 `` - `useXxx` `` 与「XXX API：」行里列出的 hook 都必须是本包入口的具名导出；
 * 属于别的包的 hook 写在点名那个包的句子里，不进这些清单。Vue 侧同款用例。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as api from '../index.js';

const readme = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../README.md'), 'utf8');

const hooksIn = (text: string): string[] => [...text.matchAll(/`(use\w+)`/g)].map(match => match[1]);

/** README 清单里列出的 hook：列表项与「XXX API：」行。 */
const listedHooks = (markdown: string): string[] => [
  ...[...markdown.matchAll(/^- `(use\w+)`/gm)].map(match => match[1]),
  ...[...markdown.matchAll(/^\S+ API：(.*)$/gm)].flatMap(match => hooksIn(match[1]))
];

describe('README 查询 API 清单', () => {
  it('清单里的每个 hook 都是包入口的具名导出', () => {
    const listed = listedHooks(readme);

    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter(name => !(name in api))).toEqual([]);
  });
});
