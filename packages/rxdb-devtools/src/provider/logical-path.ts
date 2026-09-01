/**
 * @fileoverview `files` 领域的逻辑路径校验：wire 上的字符串 → 已校验的路径段。
 *
 * @remarks
 * 两个 `files` provider（浏览器 OPFS 与原生文件）用同一份实现，不是为了少写几行，而是因为
 * **路径校验是安全边界**：两份各自演进的实现意味着同一条越界路径在一端被拒、在另一端通过，
 * 而通过的那一端不会报错，只会安静地读到根外的东西。
 *
 * 逻辑路径的定义：以 `/` 分隔、相对于 provider 自己那个根的路径，空串表示根本身。
 * 它**不是**文件系统路径——不带盘符、不带前导斜杠、不经过任何 `..` 解析。真正的物理解析
 * 由 host 完成，并在那里再校验一次（见 US-904 阶段 D 的分层校验约束）。
 *
 * @module @aiao/rxdb-devtools/provider/logical-path
 */

/** 段内不允许出现的分隔符；两种斜杠都挡，避免 Windows host 上 `a\..\b` 逃逸。 */
const INVALID_SEGMENT_PATTERN = /[/\\]/u;

/**
 * 判断一个路径段是否合法。
 *
 * @remarks
 * 非空、不含分隔符、且不是 `.` / `..`。相对路径记号在这里被整条拒绝而不是就地解析——
 * 解析等于允许对端用 `a/../../b` 描述根外的位置，而解析后的结果看上去完全正常。
 *
 * @param name - 待检查的段。
 * @returns 合法时为 `true`。
 */
export function isValidPathSegment(name: unknown): name is string {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name === '.' || name === '..') return false;
  return !INVALID_SEGMENT_PATTERN.test(name);
}

/**
 * 把 wire 上的路径切成已校验的段。
 *
 * @remarks
 * 空路径合法，表示根目录。任何一段非法即整条非法——不做「跳过坏段继续走」的容错，
 * 那会让 `a/../b` 悄悄解析成 `a/b`。连续斜杠产生的空段被丢弃（`a//b` 等价于 `a/b`），
 * 因为它描述的是同一个位置，而不是一个额外的匿名层级。
 *
 * @param path - wire 上的路径值；非字符串一律判非法。
 * @returns 校验通过的段序列，非法时为 `undefined`。
 */
export function parseLogicalPath(path: unknown): readonly string[] | undefined {
  if (typeof path !== 'string') return undefined;
  const segments = path.split('/').filter(segment => segment.length > 0);
  return segments.every(isValidPathSegment) ? segments : undefined;
}

/**
 * 把已校验的段拼回逻辑路径。
 *
 * @param segments - 已通过 {@link parseLogicalPath} 或 {@link isValidPathSegment} 的段。
 * @returns 规范形式的逻辑路径；根目录为空串。
 */
export function joinLogicalPath(segments: readonly string[]): string {
  return segments.join('/');
}

/**
 * 把路径拆成「父目录段 + 末段」。
 *
 * @remarks
 * 根目录没有末段，因此返回 `undefined`：`create-directory` / `delete` / `download`
 * 三个操作都需要一个具体的目标名，把根当成目标是它们各自的非法输入。
 *
 * @param path - wire 上的路径值。
 * @returns 父目录段与末段；路径非法或指向根时为 `undefined`。
 */
export function splitLogicalPath(path: unknown): { parent: readonly string[]; name: string } | undefined {
  const segments = parseLogicalPath(path)?.slice();
  const name = segments?.pop();
  if (segments === undefined || name === undefined) return undefined;
  return { parent: segments, name };
}
