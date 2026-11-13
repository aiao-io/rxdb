import { describe, expect, it } from 'vitest';

import { describeProblem } from './data-problem';
import type { DataProblem } from './desktop-data';

const problems: readonly DataProblem[] = [
  { kind: 'too-new', found: 9, current: 7 },
  { kind: 'stale', found: 9, current: 7 },
  { kind: 'corrupt', reason: '库的版本与当前构建一致，但结构缺少应有的表或列', missing: ['note', 'reminder.title'] },
  { kind: 'incompatible', from: 5 },
  { kind: 'unavailable', message: 'disk full' }
];

describe('describeProblem：本地数据的阻断界面文字', () => {
  it('每种情形都有标题、说明和恢复建议，且都能刷新', () => {
    for (const problem of problems) {
      const view = describeProblem(problem);
      expect(view.title.trim(), problem.kind).not.toBe('');
      expect(view.message.trim(), problem.kind).not.toBe('');
      expect(view.advice.length, problem.kind).toBeGreaterThan(0);
    }
  });

  it('数据没问题的情形（降级保护、另一个标签页升级后）绝不提供抹掉，并说明没有改动数据', () => {
    const tooNew = describeProblem(problems[0]);
    const stale = describeProblem(problems[1]);
    expect(tooNew.canErase).toBe(false);
    expect(stale.canErase).toBe(false);
    expect(tooNew.message).toContain('nothing was changed');
    expect(tooNew.message).toContain('9');
    expect(tooNew.message).toContain('7');
    expect(stale.advice.join(' ')).toContain('Reload');
  });

  it('数据确实不可用的情形才提供抹掉，且说清会永久删除什么', () => {
    for (const problem of problems.slice(2)) {
      const view = describeProblem(problem);
      expect(view.canErase, problem.kind).toBe(true);
      expect(view.advice.join(' ')).toContain('permanently removes');
    }
  });

  it('损坏时列出缺的表或列，并说明没有静默修补', () => {
    const view = describeProblem(problems[2]);
    expect(view.details).toEqual(['note', 'reminder.title']);
    expect(view.message).toContain('did not repair or erase anything');
  });

  it('没有迁移路径时报出库里的版本；存储不可用时带出原因', () => {
    expect(describeProblem(problems[3]).message).toContain('5');
    expect(describeProblem(problems[4]).message).toContain('disk full');
  });
});
