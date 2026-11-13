import { existsSync, readFileSync } from 'node:fs';

/**
 * 已知限制（ADESK-US-005）：某个浏览器引擎上确实不能通过的检查项或整个检查组，登记在
 * `baseline/limitations-<引擎>.json`，写明原因与归档的支持档位（有限支持 / 不支持），能力矩阵引用同一份结论。
 *
 * 冒烟按它判定非默认引擎的结果：登记过的失败不算失败；没登记的失败照常失败；
 * 登记了却通过了的项也算失败（限制已经过期，要从清单里删掉）——这份清单不会悄悄变成放宽断言的口子。
 *
 * 清单格式：`{ "engine": "webkit", "limitations": [ { "kind": "check" | "group" | "pageError", ... } ] }`
 *   - `{ kind: 'check', key, tier, reason }`：这个检查项在该引擎上不通过（或所在检查组整体异常导致缺项）；
 *   - `{ kind: 'group', group, tier, reason }`：整个检查组在该引擎上不能跑完（异常、缺项、页面错误都算已知）；
 *   - `{ kind: 'pageError', group, pattern, tier, reason }`：该检查组里匹配 `pattern`（正则）的页面错误是已知的。
 *
 * @typedef {{ kind: 'check', key: string, tier: string, reason: string }
 *   | { kind: 'group', group: string, tier: string, reason: string }
 *   | { kind: 'pageError', group: string, pattern: string, tier: string, reason: string }} Limitation
 */

const TIERS = new Set(['有限支持', '不支持']);

/** 读某个引擎的限制清单；没有这个文件说明该引擎没有已知限制（chromium）。 */
export function loadLimitations(engine, directory) {
  const file = new URL(`${directory}/limitations-${engine}.json`, import.meta.url);
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  validateLimitations(parsed, engine);
  return parsed.limitations;
}

/** 清单自身的校验：引擎名对得上、每项有档位与原因、检查项键与检查组名不重复登记。 */
export function validateLimitations(parsed, engine) {
  if (parsed.engine !== engine) throw new Error(`限制清单的引擎是 ${parsed.engine}，期望 ${engine}`);
  const seen = new Set();
  for (const item of parsed.limitations) {
    if (!TIERS.has(item.tier)) throw new Error(`限制「${item.key ?? item.group}」的档位必须是 有限支持 或 不支持`);
    if (!item.reason?.trim()) throw new Error(`限制「${item.key ?? item.group}」缺少原因`);
    const id = `${item.kind}:${item.key ?? item.group}:${item.pattern ?? ''}`;
    if (seen.has(id)) throw new Error(`限制重复登记：${id}`);
    seen.add(id);
  }
}

/**
 * 按限制清单判定一次运行：哪些问题是没登记的（失败）、哪些登记的限制已经过期（失败）、哪些是已知的。
 *
 * @param {readonly { group: string, failedKeys: string[], missingKeys: string[], extraKeys: string[], crashed: string | null, pageErrors: string[] }[]} outcomes
 * @param {readonly Limitation[]} limitations
 */
export function judgeRun(outcomes, limitations) {
  const unexpected = [];
  const known = [];
  const used = new Set();
  const mark = limitation => {
    used.add(limitation);
    known.push(limitation);
  };
  for (const outcome of outcomes) {
    /* 多出未声明的检查项是检查组自己的缺陷，不是浏览器限制，任何引擎上都不豁免。 */
    for (const key of outcome.extraKeys) unexpected.push(`[${outcome.group}] 多出未声明的检查项：${key}`);
    const groupLimit = limitations.find(item => item.kind === 'group' && item.group === outcome.group);
    const failing = [...outcome.failedKeys, ...outcome.missingKeys];
    if (groupLimit && (failing.length > 0 || outcome.crashed || outcome.pageErrors.length > 0)) mark(groupLimit);
    if (!groupLimit) {
      for (const key of failing) {
        const limitation = limitations.find(item => item.kind === 'check' && item.key === key);
        if (limitation) mark(limitation);
        else unexpected.push(`[${outcome.group}] 检查项未通过或缺失：${key}`);
      }
      if (outcome.crashed && !limitations.some(item => item.kind === 'check' && outcome.missingKeys.includes(item.key)))
        unexpected.push(`[${outcome.group}] 检查组异常：${outcome.crashed}`);
      for (const error of outcome.pageErrors) {
        const limitation = limitations.find(
          item => item.kind === 'pageError' && item.group === outcome.group && new RegExp(item.pattern).test(error)
        );
        if (limitation) mark(limitation);
        else unexpected.push(`[${outcome.group}] 页面错误：${error}`);
      }
    }
  }
  const stale = limitations
    .filter(item => !used.has(item))
    .map(
      item =>
        `限制已经过期（这一项已经通过，请从清单里删掉）：${item.kind} ${item.key ?? item.group}${item.pattern ? ` /${item.pattern}/` : ''}`
    );
  return { unexpected, stale, known };
}
