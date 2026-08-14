import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 读出一个包 `exports` 里声明的子路径入口（不含主入口 `.` 与 `./package.json`）。
 * @param {object} packageJson 已解析的 package.json
 * @returns {string[]} 排序后的子路径 key，如 `['./client', './testing']`
 */
export function listSubpathExports(packageJson) {
  return Object.keys(packageJson.exports ?? {})
    .filter(key => key !== '.' && key !== './package.json')
    .sort();
}

/**
 * 核对「已知不受基线保护的子路径入口」清单是否与仓库现状一致。
 *
 * 守的**不是**子路径的导出表面（那是 api-surface.mjs 的 v1 边界，明确不覆盖），
 * 而是清单本身别过期：新增或删除子路径却不同步清单 → 门禁红，
 * 强制作者意识到自己动的是一块没有基线保护的公开 API。
 *
 * @param {string} packagesDir packages/ 目录
 * @param {string[]} packages 本次纳入扫描的公开包目录名
 * @param {Map<string, string[]>} known 包名 → 已登记的子路径清单
 * @returns {string[]} 人类可读的问题描述；为空表示清单与现状一致
 */
export function auditSubpathInventory(packagesDir, packages, known) {
  const problems = [];
  const unvisited = new Set(known.keys());

  for (const pkg of packages) {
    unvisited.delete(pkg);
    const pkgJsonPath = join(packagesDir, pkg, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;

    const actual = listSubpathExports(JSON.parse(readFileSync(pkgJsonPath, 'utf8')));
    const declared = known.get(pkg) ?? [];
    const undeclared = actual.filter(key => !declared.includes(key));
    const stale = declared.filter(key => !actual.includes(key));

    if (undeclared.length > 0) {
      problems.push(`${pkg}: 新增了未登记的子路径入口 ${undeclared.join(', ')}`);
    }
    if (stale.length > 0) {
      problems.push(`${pkg}: 清单登记的子路径已不存在 ${stale.join(', ')}`);
    }
  }

  for (const pkg of [...unvisited].sort()) {
    problems.push(`${pkg}: 已不在公开包扫描范围，请从清单中移除`);
  }

  return problems;
}
