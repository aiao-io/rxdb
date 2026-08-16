import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TYPESCRIPT_COMPILER_PATH = fileURLToPath(
  new URL('../../../../../node_modules/typescript/bin/tsc', import.meta.url)
);

/**
 * 用工作区里真实的 `tsc` 编译一个临时工程，返回诊断行；空数组即编译通过。
 *
 * @remarks
 * 刻意跑真实编译器而不是 ts-morph 的内存诊断：生成产物最终是被使用者的 `tsc` 编译的，
 * 换一套实现去断言等于把被测对象也换掉了。
 */
export const runTypeScriptCompiler = (configPath: string): Promise<string[]> =>
  new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [TYPESCRIPT_COMPILER_PATH, '--project', configPath, '--pretty', 'false'],
      { encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (!error) {
          resolve([]);
          return;
        }

        const diagnostics = `${stdout}\n${stderr}`
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean);
        if (diagnostics.length > 0) {
          resolve(diagnostics);
          return;
        }

        reject(error);
      }
    );
  });
