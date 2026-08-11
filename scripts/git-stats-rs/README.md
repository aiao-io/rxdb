# git-stats（Rust）

这是 `scripts/git-stats.mjs` 的 Rust 版实现。它用 [gitoxide](https://github.com/GitoxideLabs/gitoxide) 在**进程内**做 blame，统计各项目、各作者的代码行、测试行、注释行和文档行。

目标不是换一套统计口径，而是在保持与 JS 版本相同结果的前提下，提供更快的执行速度和更稳定的资源占用。

## 前置条件

- 已安装稳定版 Rust 工具链
- 当前目录是一个包含完整 Git 历史的仓库

## 运行

在仓库根目录执行：

```sh
cargo run --manifest-path scripts/git-stats-rs/Cargo.toml
```

如果你要跑大仓库或做对比测试，直接用 release：

```sh
cargo run --release --manifest-path scripts/git-stats-rs/Cargo.toml
```

## 构建

```sh
cargo build --release --manifest-path scripts/git-stats-rs/Cargo.toml
./scripts/git-stats-rs/target/release/git-stats
```

## 当前统计口径

### 扫描目录

当前实现会扫描这些路径下被 Git 跟踪的文件：

- `apps/`
- `packages/`
- `modules/`
- `website/`
- `benchmarks/`
- `scripts/`

### 识别的文件类型

- 代码：`.js`、`.mjs`、`.jsx`、`.ts`、`.mts`、`.tsx`、`.rs`
- 文档：`.md`、`.mdx`
- 样式与模板：`.css`、`.scss`、`.html`
- 其他配置：`.sh`、`Dockerfile`、`.json`、`.yml`

### 测试文件判定

以下文件会单独计入测试行，而不是普通代码行：

- `.spec.js` / `.spec.jsx` / `.spec.ts` / `.spec.tsx`
- `.test.js` / `.test.jsx` / `.test.ts` / `.test.tsx`

## 输出内容

程序会输出两类结果：

- 项目维度汇总
- 作者维度汇总

每类结果都包含：

- 代码行
- 测试行
- 注释行
- 文档行
- 总行数占比

同时会显示实时进度条和总耗时。

## 分类规则

项目分类与 JS 版本一致：

- `apps`
- `packages`
- `modules`
- `others`

其中 `others` 目前包含 `website`、`benchmarks`、`scripts`。

## 并发配置

默认按 `available_parallelism()` 铺满所有核心。blame 现在是纯 CPU 工作，不再受进程启动开销限制，所以不设上限。可以通过环境变量覆盖：

```sh
GIT_STATS_CONCURRENCY=6 cargo run --release --manifest-path scripts/git-stats-rs/Cargo.toml
```

## 实现说明

JS 版本对每个文件 fork 一次 `git blame`。在本仓库（约 2400 个文件）里，单次进程启动约 12ms，光是 fork/exec 就要烧掉 30 秒 CPU——两个版本因此都卡在同一个瓶颈上，换语言并不会变快。Rust 版改成进程内 blame 后消除了这部分开销：

- 仓库只打开一次。`ThreadSafeRepository` 在 Rayon worker 间共享 object database 与 packfile 映射，每个 worker 通过 `to_thread_local()` 拿到自己的对象缓存与 commit → 作者缓存。
- **改名跟踪按需开启。** `git blame` 默认跨改名追溯，gix 不会。但 gix 的 `Rewrites::limit` 限制的是**改名候选对数**（新增文件数 × 删除文件数），默认 1000 在大规模重构提交上会静默关掉改名跟踪、导致行数少算。因此程序先用 `git log --name-status -M` 求出「改名目标文件」集合，只对这批文件启用 `limit: 0`（无上限）；其余文件不做改名跟踪。全开 `limit: 0` 结果同样正确，但会慢一倍以上。
- **工作区脏文件回退到子进程。** gix 只能 blame 某个 commit，而 JS 版 blame 的是工作区内容——未提交的行要记在 `Not Committed Yet` 名下。所以 `git status --porcelain` 报告为脏的文件仍然走 `git blame` 子进程，保持口径一致。

### 与 JS 版本的差异

在本仓库全量比对下，两版输出逐行一致，只有 1 行例外（约 39.8 万行中的 0.00025%）：`packages/rxdb/src/entity/metadata-options.interface.ts:882` 是一行孤立的 ` *`，位于两位作者交错编辑的 JSDoc 块中间。这类完全相同的行归属本就有歧义，git 与 gix 的 diff 启发式给出了不同答案。这是上游行为差异，不是移植缺陷。

## 说明

- 这是仓库内工具，不提供 CLI 参数接口
- 作者名会做少量标准化处理，例如把 `Jimmy Liu` 归并成 `Jimmy`
- 如果某个文件 blame 失败，会被静默跳过
