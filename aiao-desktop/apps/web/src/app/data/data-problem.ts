import type { DataProblem } from './desktop-data';

/** 阻断界面要显示的文字与可用的恢复入口。 */
export interface DataProblemView {
  readonly title: string;
  readonly message: string;
  /** 恢复建议，逐条显示。 */
  readonly advice: readonly string[];
  /** 缺少的表或列等细节，没有时为空。 */
  readonly details: readonly string[];
  /** 是否提供「抹掉本地数据」。数据没问题的情形（版本更新、更旧）绝不提供。 */
  readonly canErase: boolean;
}

/**
 * 把本地数据的问题翻成界面文字（ADESK-US-106）：说清发生了什么、数据有没有动过、下一步怎么做。
 * 只有数据确实不可用的情形才给「抹掉」；降级保护与另一个标签页升级后的拒绝写入，数据都是好的，只让刷新。
 * 文案走目录（命名空间 `desktop`，key 前缀 shell.dataProblem），`t` 由调用方提供。
 */
export function describeProblem(
  problem: DataProblem,
  t: (key: string, params?: Record<string, unknown>) => string
): DataProblemView {
  const reload = t('shell.dataProblem.adviceReload');
  const erase = t('shell.dataProblem.adviceErase');
  switch (problem.kind) {
    case 'too-new':
      return {
        title: t('shell.dataProblem.tooNewTitle'),
        message: t('shell.dataProblem.tooNewMessage', { found: problem.found, current: problem.current }),
        advice: [t('shell.dataProblem.tooNewAdviceLatest'), t('shell.dataProblem.tooNewAdviceRollback')],
        details: [],
        canErase: false
      };
    case 'stale':
      return {
        title: t('shell.dataProblem.staleTitle'),
        message: t('shell.dataProblem.staleMessage', { found: problem.found, current: problem.current }),
        advice: [t('shell.dataProblem.staleAdvice')],
        details: [],
        canErase: false
      };
    case 'corrupt':
      return {
        title: t('shell.dataProblem.corruptTitle'),
        message: t('shell.dataProblem.corruptMessage', { reason: problem.reason }),
        advice: [reload, erase],
        details: problem.missing,
        canErase: true
      };
    case 'incompatible':
      return {
        title: t('shell.dataProblem.incompatibleTitle'),
        message: t('shell.dataProblem.incompatibleMessage', { from: problem.from }),
        advice: [reload, erase],
        details: [],
        canErase: true
      };
    case 'unavailable':
      return {
        title: t('shell.dataProblem.unavailableTitle'),
        message: t('shell.dataProblem.unavailableMessage', { reason: problem.message }),
        advice: [
          reload,
          t('shell.dataProblem.unavailableAdviceTabs'),
          t('shell.dataProblem.unavailableAdvicePrivate'),
          erase
        ],
        details: [],
        canErase: true
      };
  }
}
