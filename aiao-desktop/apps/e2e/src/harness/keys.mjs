/**
 * 冒烟输出里的检查项键：对象逐层展开成点分路径，数组与基本值是叶子（`unopened` 是数组，按一个叶子计）。
 *
 * @param {unknown} value
 * @param {string} [prefix]
 * @returns {string[]}
 */
export function flattenKeys(value, prefix = '') {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
  return prefix ? [prefix] : [];
}

/** 沿点分路径取值。 */
export function valueAt(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

/** 一个检查项通过：布尔值为 true；数组（例如 `unopened`）必须为空；其余按真值判断。 */
export function checkPasses(value) {
  if (Array.isArray(value)) return value.length === 0;
  return Boolean(value);
}

/** 没通过的检查项键。 */
export function failedChecks(result) {
  return flattenKeys(result).filter(key => !checkPasses(valueAt(result, key)));
}

/** 比较声明的键与实际输出的键：缺了哪些、多了哪些。 */
export function compareKeys(declared, actual) {
  const have = new Set(actual);
  const want = new Set(declared);
  return {
    missing: declared.filter(key => !have.has(key)),
    extra: actual.filter(key => !want.has(key))
  };
}
