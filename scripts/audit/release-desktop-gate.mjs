/**
 * scripts/audit/release-desktop-gate.mjs
 *
 * 按缩进切分 workflow YAML 的两个纯函数，供 `release-desktop-gate.spec.mjs` 用来
 * 断言发布链路上的门禁接线（US-905 AC#17）。
 *
 * 为什么不引 YAML 解析器：本仓库没有这个依赖，而这里要问的两个问题
 * （「`tauri-smoke` 这个 job 的正文是哪几行」「它有哪几步」）在一份缩进规整的
 * workflow 上按缩进就能答准。`workflow-action-pins.mjs` 同样是按行扫的，
 * 为一条结构断言引入一个运行时依赖不划算。
 *
 * 只做**切分**，不做取值：`timeout-minutes` 该多大、哪些 OS 必须在矩阵里，
 * 那些是判据，属于 spec；放进这里会让「规则」散落在两个文件。
 */

/**
 * 取出某个顶层键（job 名，或 `on` 这类 workflow 级的块）的正文。
 *
 * @param {string[]} lines 整份 YAML 按行拆开
 * @param {string} name 键名，例如 `tauri-smoke`
 * @returns {string[]} 该键下缩进更深的那些行（含其间的空行），不含键那一行本身
 * @throws {Error} 找不到该键时抛出
 *
 * @remarks
 * 找不到就抛，不返回空数组：下游断言全是「正文里有没有某一行」的形态，
 * 空数组会让它们一条不剩地变成真空真——门禁被整个删掉时反而全绿。
 */
export function extractJob(lines, name) {
  const header = new RegExp(`^(\\s*)${name}:\\s*$`);
  const start = lines.findIndex(line => header.test(line));
  if (start === -1) throw new Error(`workflow 里找不到 \`${name}:\``);

  const indent = (header.exec(lines[start])?.[1] ?? '').length;
  const body = [];

  for (const line of lines.slice(start + 1)) {
    // 空行归属未定，先收着：它可能夹在正文中间，也可能是正文与下一个键之间的分隔。
    if (line.trim() === '') {
      body.push(line);
      continue;
    }
    if (line.length - line.trimStart().length <= indent) break;
    body.push(line);
  }

  // 收尾的空行是分隔而不是正文，去掉之后 `deepEqual` 才写得干净。
  while (body.at(-1)?.trim() === '') body.pop();

  return body;
}

/**
 * 把一个 job 正文里的 `steps:` 切成一步一组。
 *
 * @param {string[]} jobLines `extractJob` 的返回值
 * @returns {string[][]} 每一步的全部行（含 `- ` 开头那一行）；没有 `steps:` 时为空数组
 *
 * @remarks
 * 步的边界取**第一个列表项的缩进**，不写死 6 个空格：同一份文件里 job 的嵌套深度
 * 一致，但写死之后这个函数就只对这一份 workflow 成立了。
 */
export function extractSteps(jobLines) {
  const start = jobLines.findIndex(line => /^\s*steps:\s*$/.test(line));
  if (start === -1) return [];

  const rest = jobLines.slice(start + 1);
  const first = rest.find(line => /^\s*-\s/.test(line));
  if (first === undefined) return [];

  const marker = first.length - first.trimStart().length;
  const steps = [];

  for (const line of rest) {
    const opensStep = /^\s*-\s/.test(line) && line.length - line.trimStart().length === marker;
    if (opensStep) steps.push([line]);
    else if (steps.length > 0 && line.trim() !== '') steps.at(-1).push(line);
  }

  return steps;
}
