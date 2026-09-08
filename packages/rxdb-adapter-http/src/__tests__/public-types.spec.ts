import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 公共类型面的**可移植性**检查（评审 #11）。
 *
 * @remarks
 * 本仓库的 `tsconfig.base.json` 里 `lib` 带着 `dom`，于是 `ResponseType` / `RequestInit`
 * 这类 DOM 独有的全局名写进公开接口时，本地怎么编都是绿的。而消费方完全可以是纯 Node
 * 工程（`lib: ["es2025"]`），他们编 `dist/*.d.ts` 时那个名字无处可寻，构建以
 * `TS2304: Cannot find name` 失败——一个我们自己永远看不见的红。
 *
 * 所以这里把 `lib` 收窄到 `es2025`、`types` 清空，专挑 **TS2304** 一种诊断。
 * 模块解析失败（TS2307，`@aiao/rxdb` 被 `noResolve` 挡在 program 之外）预期之内，
 * 不参与断言：它只让跨包类型退化成 `any`，不影响本文件自己的全局名是否可寻。
 *
 * `noResolve` 是**必需**的，不是优化：没有它，`@aiao/rxdb` 会被解析进来，整个 core 包
 * （722 个文件）跟着进 program 一起做全量类型检查——本地 2.2s、CI 带覆盖率并发时 >10s，
 * 直接撞穿 `testTimeout`。而这些文件的诊断本来就被下面的 `diagnostic.file` 过滤器全丢掉，
 * 一分钱没换来。挡住之后 program 只剩 lib + 本文件，约 0.1s。
 */
describe('公共类型面不依赖 DOM lib（评审 #11）', () => {
  /** DOM 全局名一旦漏进这里，纯 Node 消费方的构建当场失败 */
  const PUBLIC_TYPE_FILES = ['http.interface.ts'];

  const missingGlobalNames = (fileName: string): string[] => {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', fileName);
    const options: ts.CompilerOptions = {
      lib: ['lib.es2025.d.ts'],
      types: [],
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      noResolve: true,
      strict: true
    };
    const program = ts.createProgram([path], options);
    return (
      ts
        .getPreEmitDiagnostics(program)
        // TS 的 `fileName` 恒为正斜杠，`join()` 在 win32 上给的是反斜杠——这里要换的是**单个**
        // 反斜杠。写成 `'\\\\'`（双反斜杠）在 win32 上一个都不匹配，过滤器会静默滤空、恒绿。
        .filter(diagnostic => diagnostic.code === 2304 && diagnostic.file?.fileName === path.replaceAll('\\', '/'))
        .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
    );
  };

  it.each(PUBLIC_TYPE_FILES)('%s 里的全局名在纯 Node 的 lib 下也找得到', fileName => {
    expect(missingGlobalNames(fileName)).toEqual([]);
  });
});
