/**
 * README 的查询 API 清单与包入口对账（RV-01a1bb334b9b）。
 *
 * @remarks
 * 消费者照 README 的清单导入，清单里有、入口里没有的名字会在编译或 ESM 加载时失败。
 * 规则：列表项 `` - `useXxx` `` 与「XXX API：」行里列出的 hook 都必须是本包入口的具名导出；
 * 属于别的包的 hook 写在点名那个包的句子里，不进这些清单。React 侧同款用例。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as api from '../index';

const listedHooks = (markdown: string): string[] =>
  markdown
    .split('\n')
    .filter(line => /^- `use\w+`|^\S+ API[：:]/.test(line))
    .flatMap(line => [...line.matchAll(/`(use\w+)`/g)].map(match => match[1]));

describe('README 查询 API 清单', () => {
  it.each(['README.md', 'README.zh-CN.md'])('%s 的清单覆盖基础与图查询，并与包入口一致', filename => {
    const readme = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..', filename), 'utf8');
    const listed = listedHooks(readme);
    expect(listed).toEqual(expect.arrayContaining(['useFind', 'useFindOneOrFail', 'useCount', 'useGraphPaths']));
    expect(listed.filter(name => !(name in api))).toEqual([]);
  });
});
