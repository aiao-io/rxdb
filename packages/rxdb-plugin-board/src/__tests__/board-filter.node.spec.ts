import { describe, expect, it } from 'vitest';

import {
  isBoardFilterEmpty,
  matchesBoardFilter,
  parseBoardFilter,
  suggestBoardFilter,
  toggleBoardFilterValue,
  type BoardFilterTarget
} from '../filter/board-filter.js';

const today = '2026-10-19';

const task = (overrides: Partial<BoardFilterTarget> = {}): BoardFilterTarget => ({
  title: '修复登录 bug',
  description: '登录页在弱网下超时后没有重试入口。',
  dueDate: '2026-11-05',
  columnTitle: 'To do',
  labelNames: ['核心'],
  ...overrides
});

const matches = (query: string, target: BoardFilterTarget = task()): boolean =>
  matchesBoardFilter(target, parseBoardFilter(query), today);

describe('parseBoardFilter（筛选语法）', () => {
  it('空白查询为空筛选', () => {
    expect(isBoardFilterEmpty(parseBoardFilter('   '))).toBe(true);
    expect(isBoardFilterEmpty(parseBoardFilter('label:'))).toBe(true);
    expect(isBoardFilterEmpty(parseBoardFilter('登录'))).toBe(false);
  });

  it('字段令牌、逗号多值、引号与否定', () => {
    expect(parseBoardFilter('登录 -label:文档 column:"To do",Doing due:overdue')).toEqual({
      text: [{ value: '登录', negated: false }],
      terms: [
        { field: 'label', values: ['文档'], negated: true },
        { field: 'column', values: ['To do', 'Doing'], negated: false },
        { field: 'due', values: ['overdue'], negated: false }
      ]
    });
  });

  it('字段名大小写不敏感；未知字段按关键词处理', () => {
    expect(parseBoardFilter('LABEL:核心 http://x').terms).toEqual([
      { field: 'label', values: ['核心'], negated: false }
    ]);
    expect(parseBoardFilter('LABEL:核心 http://x').text).toEqual([{ value: 'http://x', negated: false }]);
  });

  it('引号包裹的关键词保留空格', () => {
    expect(parseBoardFilter('"弱网 下"').text).toEqual([{ value: '弱网 下', negated: false }]);
  });
});

describe('matchesBoardFilter（匹配语义）', () => {
  it('关键词：标题或描述包含、大小写不敏感、多词 AND、否定排除', () => {
    expect(matches('登录')).toBe(true);
    expect(matches('弱网')).toBe(true);
    expect(matches('BUG')).toBe(true);
    expect(matches('登录 超时')).toBe(true);
    expect(matches('登录 同步')).toBe(false);
    expect(matches('-同步')).toBe(true);
    expect(matches('-登录')).toBe(false);
  });

  it('label：同一令牌多值 OR、多令牌 AND、否定、大小写不敏感', () => {
    const target = task({ labelNames: ['核心', 'Docs'] });
    expect(matches('label:核心', target)).toBe(true);
    expect(matches('label:测试,docs', target)).toBe(true);
    expect(matches('label:核心 label:测试', target)).toBe(false);
    expect(matches('-label:核心', target)).toBe(false);
    expect(matches('-label:测试', target)).toBe(true);
  });

  it('column：按列标题精确匹配', () => {
    expect(matches('column:"to do"')).toBe(true);
    expect(matches('column:Doing')).toBe(false);
    expect(matches('column:Doing,"To do"')).toBe(true);
  });

  it('due：逾期 / 今天 / 未到期 / 无截止日', () => {
    expect(matches('due:overdue', task({ dueDate: '2026-10-18' }))).toBe(true);
    expect(matches('due:today', task({ dueDate: today }))).toBe(true);
    expect(matches('due:upcoming')).toBe(true);
    expect(matches('due:none', task({ dueDate: null }))).toBe(true);
    expect(matches('due:none')).toBe(false);
    expect(matches('due:overdue,today', task({ dueDate: today }))).toBe(true);
  });

  it('due：精确日期、比较与区间', () => {
    expect(matches('due:2026-11-05')).toBe(true);
    expect(matches('due:>2026-11-01')).toBe(true);
    expect(matches('due:<2026-11-05')).toBe(false);
    expect(matches('due:<=2026-11-05')).toBe(true);
    expect(matches('due:>=2026-11-06')).toBe(false);
    expect(matches('due:2026-11-01..2026-11-30')).toBe(true);
    expect(matches('due:2026-12-01..2026-12-31')).toBe(false);
    expect(matches('due:>2026-11-01', task({ dueDate: null }))).toBe(false);
  });

  it('非法取值不兜底：匹配不到任何任务', () => {
    expect(matches('due:someday')).toBe(false);
    expect(matches('has:assignee')).toBe(false);
  });

  it('has / no：标签、截止日、描述的有无', () => {
    expect(matches('has:label')).toBe(true);
    expect(matches('no:label', task({ labelNames: [] }))).toBe(true);
    expect(matches('has:due', task({ dueDate: null }))).toBe(false);
    expect(matches('no:description', task({ description: null }))).toBe(true);
    expect(matches('-has:description', task({ description: null }))).toBe(true);
  });

  it('不完整令牌不参与筛选', () => {
    expect(matches('label: 登录')).toBe(true);
  });
});

describe('toggleBoardFilterValue（点击即筛选）', () => {
  it('不存在则追加、存在则移除', () => {
    expect(toggleBoardFilterValue('', 'label', '核心')).toBe('label:核心');
    expect(toggleBoardFilterValue('登录', 'label', '核心')).toBe('登录 label:核心');
    expect(toggleBoardFilterValue('登录 label:核心', 'label', '核心')).toBe('登录');
  });

  it('从多值令牌中只移除该值；含空格的值加引号', () => {
    expect(toggleBoardFilterValue('label:核心,文档', 'label', '核心')).toBe('label:文档');
    expect(toggleBoardFilterValue('', 'column', 'To do')).toBe('column:"To do"');
    expect(toggleBoardFilterValue('column:"To do"', 'column', 'to do')).toBe('');
  });

  it('否定令牌不当作已选中', () => {
    expect(toggleBoardFilterValue('-label:核心', 'label', '核心')).toBe('-label:核心 label:核心');
  });
});

describe('suggestBoardFilter（输入补全）', () => {
  const context = {
    labels: [
      { name: '核心', color: '#e11d48' },
      { name: '文档', color: '#2563eb' }
    ],
    columns: ['To do', 'Doing']
  };

  it('空输入与部分字段名补全字段', () => {
    expect(suggestBoardFilter('', context).map(item => item.value)).toEqual([
      'label:',
      'column:',
      'due:',
      'has:',
      'no:'
    ]);
    expect(suggestBoardFilter('登录 la', context).map(item => item.query)).toEqual(['登录 label:']);
    expect(suggestBoardFilter('-co', context).map(item => item.query)).toEqual(['-column:']);
  });

  it('字段后补全取值（含标签色），选中后补空格', () => {
    const labels = suggestBoardFilter('label:', context);
    expect(labels.map(item => item.value)).toEqual(['核心', '文档']);
    expect(labels[0]).toMatchObject({ kind: 'value', color: '#e11d48', query: 'label:核心 ' });
    expect(suggestBoardFilter('column:do', context).map(item => item.query)).toEqual([
      'column:"To do" ',
      'column:Doing '
    ]);
    expect(suggestBoardFilter('due:', context).map(item => item.value)).toEqual([
      'overdue',
      'today',
      'upcoming',
      'none'
    ]);
    expect(suggestBoardFilter('no:', context).map(item => item.value)).toEqual(['label', 'due', 'description']);
  });

  it('多值令牌只补最后一段', () => {
    expect(suggestBoardFilter('label:核心,文', context).map(item => item.query)).toEqual(['label:核心,文档 ']);
  });

  it('未闭合引号里的空格不结束令牌', () => {
    expect(suggestBoardFilter('column:"To ', context).map(item => item.query)).toEqual(['column:"To do" ']);
  });

  it('以空格结尾时补全下一个字段；普通关键词无补全', () => {
    expect(suggestBoardFilter('label:核心 ', context).map(item => item.query)[0]).toBe('label:核心 label:');
    expect(suggestBoardFilter('登录', context)).toEqual([]);
  });
});
