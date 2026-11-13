import { defineConfig } from 'vitest/config';

/**
 * web 里与界面无关的代码（`src/app/{services,disk,vm,data}`）在 Node 下跑单测，服务类经 TestBed 注入
 * （脚手架见 `src/app/testing/`）。真实 OPFS、Vivari、Worker 与界面行为由正式构建上的冒烟覆盖（`aiao-desktop-e2e:e2e`）。
 *
 * 覆盖率门槛（ADESK-US-006）：`aiao-desktop-web:test` 默认带覆盖率，统计范围内的每个文件（`perFile`）
 * 行与语句都要 ≥ 80%。低于门槛时 vitest 退出码为 1，并逐个文件报出
 * `Coverage for lines (实际%) does not meet global threshold (80%) for <文件>`，实际值与门槛之差即缺口。
 *
 * 只跑一部分 spec 时（给 vitest 传文件过滤，例如 `vitest run src/app/services/toast.spec.ts`），没跑到的文件覆盖率为 0，
 * 会触发门槛；这种用法加 `--coverage.enabled=false` 关掉覆盖率与门槛，TDD 的 `--watch` 同理。
 * 经 nx 跑时同样追加这个参数：`pnpm nx run aiao-desktop-web:test --coverage.enabled=false <spec 文件>`。
 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/aiao-desktop/apps/web-test',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'aiao-desktop-web',
    watch: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // 用例里 vi.stubGlobal 装的浏览器全局（视口、matchMedia、navigator.locks…）与 vi.stubEnv 改的环境变量，
    // 在每个用例结束后自动还原。
    unstubGlobals: true,
    unstubEnvs: true,
    reporters: ['default'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: '../../../coverage/aiao-desktop/apps/web',
      reporter: ['text', 'json-summary'],
      // 非界面代码；Angular 组件与模板（components、apps、pages、shared）由冒烟覆盖，不在统计范围内。
      include: ['src/app/{services,disk,vm,data}/**/*.ts'],
      /*
       * 范围内放不进 80% 的胶水文件，一条一个文件、一个理由；不得整目录排除，新增排除项必须在这里写明理由。
       * 排除项当前只有两处，都是只能在真实浏览器里运行的路径，由冒烟覆盖。
       */
      exclude: [
        'src/**/*.spec.ts',
        // 测试脚手架（Angular 注入环境、替身）本身不计入统计，它在统计范围之外，这里写明是为了防止日后范围放宽时被算进来。
        'src/app/testing/**',
        // photo-encoder.ts：把程序化插画离屏渲染成 SVG，再经 Image 解码、OffscreenCanvas 编码成真实的 PNG/JPEG，
        // 全程依赖真实 DOM 与画布，Node 里没有对应实现；磁盘首次复制内置图片时才运行，
        // 由冒烟的 disk-terminal 分组（桌面上的截图用预览打开）覆盖。
        'src/app/services/photo-encoder.ts',
        // sqlite-wasm.worker.ts：专用 Worker 的入口，只有一行 expose(new SqliteClient())；
        // OPFS 上的 SQLite 只能在 Worker 里打开，Node 单测无法加载，由冒烟里真实的桌面启动覆盖。
        'src/app/data/sqlite-wasm.worker.ts'
      ],
      thresholds: { perFile: true, lines: 80, statements: 80 }
    }
  }
});
