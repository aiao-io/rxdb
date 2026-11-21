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

const RELOAD = 'Reload this page to try again.';
const ERASE =
  'If the problem keeps coming back, you can erase the local data and start with a fresh desktop. This permanently removes the files, settings and app data saved in this browser for this site.';

/**
 * 把本地数据的问题翻成界面文字（ADESK-US-106）：说清发生了什么、数据有没有动过、下一步怎么做。
 * 只有数据确实不可用的情形才给「抹掉」；降级保护与另一个标签页升级后的拒绝写入，数据都是好的，只让刷新。
 */
export function describeProblem(problem: DataProblem): DataProblemView {
  switch (problem.kind) {
    case 'too-new':
      return {
        title: 'Aiao Desktop needs to be updated',
        message: `The data saved in this browser was created by a newer version of Aiao Desktop (data version ${problem.found}). This page is older (data version ${problem.current}), so it did not open the data and nothing was changed.`,
        advice: [
          'Reload this page to get the latest version.',
          'If you rolled the site back to an older deployment, roll forward again. Your files, settings and app data are safe.'
        ],
        details: [],
        canErase: false
      };
    case 'stale':
      return {
        title: 'Aiao Desktop was updated in another tab',
        message: `Another tab upgraded the data saved in this browser (data version ${problem.found}). This page is still on data version ${problem.current}, so it stopped saving to keep your data safe.`,
        advice: ['Reload this page to continue.'],
        details: [],
        canErase: false
      };
    case 'corrupt':
      return {
        title: 'The local data is damaged',
        message: `${problem.reason}. Aiao Desktop did not repair or erase anything.`,
        advice: [RELOAD, ERASE],
        details: problem.missing,
        canErase: true
      };
    case 'incompatible':
      return {
        title: 'The local data can’t be upgraded',
        message: `This browser holds data from an older data version (${problem.from}) that this version of Aiao Desktop does not know how to upgrade. Nothing was changed.`,
        advice: [RELOAD, ERASE],
        details: [],
        canErase: true
      };
    case 'unavailable':
      return {
        title: 'Local storage is unavailable',
        message: `Aiao Desktop could not open the data saved in this browser: ${problem.message}`,
        advice: [
          RELOAD,
          'Close other tabs of this site, and make sure the browser allows this site to store data.',
          'If this is a private or incognito window, open the site in a normal window: some browsers don’t provide local storage in private windows.',
          ERASE
        ],
        details: [],
        canErase: true
      };
  }
}
