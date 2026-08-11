import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 检查 packages/ 下所有库包的 vite.config.mts 中 external 是否覆盖
 * package.json 的 dependencies + peerDependencies。
 *
 * 规则:
 * - 跳过没有 package.json / vite.config.mts 的目录
 * - 跳过 ng-packagr 构建的 Angular 包(自动 externalize peerDeps)
 * - external 数组支持字符串与正则字面量(例如 /^@aiao\//)
 * - 字符串 external 形如 '@aiao/rxdb' 也覆盖其子路径导出 '@aiao/rxdb/sqlite'
 */

const root = process.cwd();
const packagesDir = join(root, 'packages');

const issues = [];
const skipped = [];

const entries = readdirSync(packagesDir).filter(name => {
  const full = join(packagesDir, name);
  return statSync(full).isDirectory();
});

for (const pkg of entries.sort()) {
  const pkgDir = join(packagesDir, pkg);
  const pkgJsonPath = join(pkgDir, 'package.json');
  const vitePath = join(pkgDir, 'vite.config.mts');
  const ngPkgPath = join(pkgDir, 'ng-package.json');

  let pkgJson;
  try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  } catch {
    continue;
  }

  const deps = Object.keys(pkgJson.dependencies || {});
  const peerDeps = Object.keys(pkgJson.peerDependencies || {});
  const allDeps = [...new Set([...deps, ...peerDeps])];

  if (allDeps.length === 0) continue;

  if (exists(ngPkgPath)) {
    console.log(`⚪ ${pkg}: Angular package (ng-packagr, auto-externalizes peerDeps)`);
    skipped.push(pkg);
    continue;
  }

  if (!exists(vitePath)) {
    console.log(`⚠️  ${pkg}: has deps but no vite.config.mts and no ng-package.json`);
    issues.push({ pkg, issue: 'Missing build config', deps: allDeps });
    continue;
  }

  const viteConfig = readFileSync(vitePath, 'utf-8');
  const external = parseExternals(viteConfig);

  if (external === null) {
    console.log(`❌ ${pkg}: no 'external:' configuration found in vite.config.mts`);
    issues.push({ pkg, issue: 'No external config', deps: allDeps });
    continue;
  }

  const missing = allDeps.filter(dep => !matchExternal(external, dep));

  if (missing.length > 0) {
    console.log(`❌ ${pkg}: missing externals: ${missing.join(', ')}`);
    issues.push({ pkg, issue: 'Missing externals', missing });
  } else {
    console.log(`✅ ${pkg}: all ${allDeps.length} dependencies are external`);
  }
}

if (issues.length > 0) {
  console.log('\n📋 Summary of issues:');
  for (const { pkg, issue, missing, deps } of issues) {
    console.log(`\n${pkg}:`);
    console.log(`  Issue: ${issue}`);
    if (missing) console.log(`  Missing: ${missing.join(', ')}`);
    if (deps) console.log(`  All deps: ${deps.join(', ')}`);
  }
  process.exit(1);
}

console.log(
  `\n✅ All packages have correct external configurations! (scanned ${entries.length - skipped.length} libs)`
);

/* ---------- helpers ---------- */

function exists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

/** 解析 vite.config.mts 中的 external 数组，兼容字符串和正则字面量。解析失败或不存在返回 null。 */
function parseExternals(configSrc) {
  const start = configSrc.search(/external\s*:\s*\[/);
  if (start === -1) return null;

  const openIdx = start + configSrc.slice(start).indexOf('[');
  let i = openIdx + 1;
  let depth = 1;
  while (i < configSrc.length && depth > 0) {
    const ch = configSrc[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    else if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(configSrc, i, ch);
    } else if (ch === '/' && configSrc[i + 1] !== '/') {
      i = skipRegex(configSrc, i);
    }
    i++;
  }
  const endIdx = i - 1;
  const inner = configSrc.slice(openIdx + 1, endIdx);

  const items = [];
  let k = 0;
  while (k < inner.length) {
    const ch = inner[k];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ',') {
      k++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = skipString(inner, k, ch);
      items.push(inner.slice(k + 1, end));
      k = end + 1;
      continue;
    }
    if (ch === '/') {
      const end = skipRegex(inner, k);
      const body = inner.slice(k + 1, end);
      let f = end + 1;
      while (f < inner.length && /[gimsuy]/.test(inner[f])) f++;
      const flags = inner.slice(end + 1, f);
      try {
        items.push(new RegExp(body, flags));
      } catch {
        // 忽略无法编译的正则
      }
      k = f;
      continue;
    }
    // 注释或意外字符:停止扫描
    if (ch === '/' && inner[k + 1] === '/') break;
    k++;
  }
  return items;
}

/**
 * 在字符串内从开引号向后扫描，找到匹配的闭引号。
 * 处理反斜杠转义（`\\'` 不算结束）。
 * @param {string} s 源串
 * @param {number} i 当前引号位置
 * @param {string} quote 引号字符 ' " 或 `
 * @returns {number} 闭引号索引（找不到时返回串尾）
 */
function skipString(s, i, quote) {
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === '\\') {
      j += 2;
      continue;
    }
    if (s[j] === quote) return j;
    j++;
  }
  return j;
}

/**
 * 在正则字面量内向后扫描，找到匹配的 `/`。
 * 字符类 `[]` 内的 `/` 不视为结束（否则会把 `[/foo/]` 当成两个相邻的正则）。
 * @param {string} s 源串
 * @param {number} i 起始 `/` 位置
 * @returns {number} 闭斜杠索引
 */
function skipRegex(s, i) {
  let j = i + 1;
  let inClass = false;
  while (j < s.length) {
    const ch = s[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) return j;
    j++;
  }
  return j;
}

/**
 * 判断某个依赖是否被 external 列表覆盖。
 * - RegExp 项：直接 test；
 * - 字符串项：完全相等，或 dep 以 `external/` 开头（覆盖子路径导出，例如
 *   external `'@aiao/rxdb'` 也算覆盖 `'@aiao/rxdb/sqlite'`）。
 * @param {Array<string | RegExp>} externals
 * @param {string} dep 待校验的依赖名
 * @returns {boolean}
 */
function matchExternal(externals, dep) {
  for (const e of externals) {
    if (e instanceof RegExp) {
      if (e.test(dep)) return true;
    } else if (typeof e === 'string') {
      if (e === dep) return true;
      if (dep.startsWith(e + '/')) return true;
    }
  }
  return false;
}
