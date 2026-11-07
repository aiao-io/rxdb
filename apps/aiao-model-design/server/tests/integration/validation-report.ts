import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * 把 SC-xxx 自动化验证报告写到**未跟踪**的 `tmp/validation/`。
 *
 * 以前三个 sweep 测试直接改 `specs/006-model-gateway/validation/*.md`：每跑一次
 * 门禁就写进一个新时间戳 + 一组新数字，工作区跑完必脏，`git log` 里 23 次提交
 * 全是同一份 baseline 的抖动。归档进 specs 是**人的决定**，不该由测试代跑。
 *
 * 只有一条写入路径、不做 try/catch 兜底：写不进去就让测试红，比默默不出报告好。
 *
 * @param fileName 报告文件名，与 specs 下同名文档对齐
 * @param body 完整报告正文（不再拼接进既有文档，所以自带标题）
 * @returns 实际写入的绝对路径
 */
export function writeValidationReport(fileName: string, body: string): string {
  const dir = join(workspaceRoot, 'tmp', 'validation');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, fileName);
  writeFileSync(path, body, 'utf-8');
  return path;
}
