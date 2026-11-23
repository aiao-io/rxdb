/**
 * Aiao Code 线上验收（`verify-aiao-code.mjs`）的报告判定：控制台错误归哪一栏、验收通不通过。
 * 抽成纯函数，脚本本身一导入就启动浏览器，没法单测。
 */

/** 报告里应有的检查项数量（`checks` 的键数）；历史验收报告都是 9 项。 */
export const EXPECTED_CHECKS = 9;

const MAX_TEXT = 300;

function originOf(address) {
  try {
    return new URL(address).origin;
  } catch {
    return undefined;
  }
}

/**
 * 记下桌面页面上的一条控制台 error。桌面自己来源的（包括 `Failed to load resource`：桌面的图标、字体、chunk 加载失败是桌面的问题）
 * 记进 `desktopErrors`；其余——Aiao Code 与它加载的第三方资源——记进 `appConsoleErrors`，带上来源方便判断；
 * 没有来源或来源解析不了的，不能认定是桌面的，也记进 `appConsoleErrors` 并写明来源未知。
 *
 * @param report 验收报告（修改它的 `desktopErrors` 与 `appConsoleErrors`）
 * @param message `{ text, url }`：控制台文字与 `ConsoleMessage.location().url`
 * @param desktopOrigin 桌面自己的来源（origin）
 */
export function recordConsoleError(report, { text, url }, desktopOrigin) {
  if (originOf(url) === desktopOrigin) {
    report.desktopErrors.push(text);
    return;
  }
  report.appConsoleErrors.push(`${text.slice(0, MAX_TEXT)}（${url || '来源未知'}）`);
}

/** 验收没通过的原因，空数组表示通过。 */
export function failureReasons(report) {
  const reasons = [];
  if (report.error) reasons.push(`验收中断：${report.error}`);
  if (report.appPageErrors.length > 0) {
    reasons.push(`应用有 ${report.appPageErrors.length} 条页面错误：${report.appPageErrors.join(' | ')}`);
  }
  if (report.appConsoleErrors.length > 0) {
    reasons.push(`应用有 ${report.appConsoleErrors.length} 条控制台错误：${report.appConsoleErrors.join(' | ')}`);
  }
  const checks = Object.entries(report.checks);
  if (checks.length !== EXPECTED_CHECKS) reasons.push(`检查项应有 ${EXPECTED_CHECKS} 项，实际 ${checks.length} 项`);
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length > 0) reasons.push(`检查项没有通过：${failed.join('、')}`);
  return reasons;
}

/** 验收通过：没有中断、应用没有页面错误与控制台错误，且全部检查项为真。桌面自己的错误由检查项 `noDesktopErrors` 判定。 */
export const isPassed = report => failureReasons(report).length === 0;
