import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SHORTCUTS, brokenOnes, classify, formatReport } from './checklist.mjs';

const matrix = readFileSync(new URL('../../../../requirements/capability-matrix.md', import.meta.url), 'utf8');

/** 单元格里的组合：用「、」分隔，每个可能被行内代码包着（含双反引号包住的反引号）。 */
function combosOf(cell) {
  return cell.split('、').map(part => {
    const text = part.trim();
    const double = /^``\s*(.*?)\s*``$/.exec(text);
    if (double) return double[1];
    const single = /^`(.*)`$/.exec(text);
    return single ? single[1] : text;
  });
}

function matrixCombos() {
  const section = matrix.split('## 快捷键')[1]?.split(/\n## /)[0] ?? '';
  return section
    .split('\n')
    .filter(line => line.startsWith('|') && !/^\|\s*(组合|-)/.test(line))
    .flatMap(line => combosOf(line.split('|')[1] ?? ''));
}

test('清单覆盖能力矩阵「快捷键」表里的每个组合，且没有多出的', () => {
  const documented = matrixCombos();
  assert.ok(documented.length >= 9, `能力矩阵里应有至少 9 个组合，读到 ${documented.length}`);
  assert.deepEqual([...documented].sort(), SHORTCUTS.map(item => item.combo).sort());
});

test('清单项的 id 唯一，每项都说明怎么按与期望的行为', () => {
  assert.equal(new Set(SHORTCUTS.map(item => item.id)).size, SHORTCUTS.length);
  for (const item of SHORTCUTS) {
    assert.ok(item.press && item.description, `${item.id} 缺说明`);
    assert.ok(item.prepare && item.effect, `${item.id} 缺准备或期望`);
  }
});

test('结果分三类：没到达、到达且正确、到达但不对；只有后者算验收失败', () => {
  const results = [
    { id: 'a', combo: '⌘K', reached: true, works: true },
    { id: 'b', combo: '⌘W', reached: false, works: null, note: '标签页被关闭' },
    { id: 'c', combo: 'F4', reached: true, works: false }
  ];
  assert.deepEqual(
    classify(results).map(item => item.verdict),
    ['到达且行为正确', '没到达页面（被浏览器或系统占用）', '到达但行为不对']
  );
  assert.deepEqual(
    brokenOnes(results).map(item => item.combo),
    ['F4']
  );
});

test('报告是一张 Markdown 表，带环境与备注', () => {
  const text = formatReport([{ id: 'b', combo: '⌘W', reached: false, works: null, note: '标签页被关闭' }], {
    browser: 'Chrome 140',
    platform: 'macOS',
    date: '2026-11-13'
  });
  assert.match(text, /真实键盘实测：Chrome 140，macOS，2026-11-13/);
  assert.match(text, /\| ⌘W \| 没到达页面（被浏览器或系统占用） \| 标签页被关闭 \|/);
});
