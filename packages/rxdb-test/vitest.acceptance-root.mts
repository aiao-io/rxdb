/**
 * coverage-acceptance 的 blob / 中间报告根目录。
 *
 * @remarks
 * 目录由 `scripts/run-coverage-acceptance.mjs` 用 `fs.mkdtempSync(os.tmpdir())` 创建并
 * 通过本环境变量传进来，**不在包内**（SQLC-039）：runner 开跑前与 `finally` 都会
 * `rmSync` 整个目录，放在包内就会把同路径下任何被跟踪的文件标成已删除，
 * 被中断的运行还会留下不完整的 blob 污染工作区。
 *
 * 本包四段 run 共用同一个根：三段 run 各自往 `<root>/blobs/<suite>.json` 写 blob，
 * merge 段则由 runner 把 `<root>/blobs` 作为 `--mergeReports` 的入参传进去。
 *
 * 刻意不提供包内兜底路径 —— 直接 `vitest --config vitest.coverage-acceptance.*.mts`
 * 会立刻抛错并指向 runner，而不是悄悄在包里再造一个临时目录。
 *
 * @module
 */

/** 传递 acceptance 根目录的环境变量名。 */
export const ACCEPTANCE_ROOT_ENV = 'AIAO_ACCEPTANCE_ROOT';

/**
 * 读取 runner 传入的 acceptance 根目录。
 *
 * @returns 绝对路径（位于 `os.tmpdir()` 下）
 * @throws 环境变量缺失时抛出，提示改用 runner 入口
 */
export const resolveAcceptanceRoot = (): string => {
  const root = process.env[ACCEPTANCE_ROOT_ENV];
  if (root === undefined || root.length === 0) {
    throw new Error(
      `${ACCEPTANCE_ROOT_ENV} is not set. Run coverage acceptance through scripts/run-coverage-acceptance.mjs ` +
        `(nx run <project>:coverage-acceptance) instead of invoking vitest directly.`
    );
  }
  return root;
};
