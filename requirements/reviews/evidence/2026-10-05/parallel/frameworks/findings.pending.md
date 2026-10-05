# frameworks 待主控去重编号的生产问题

日期：2026-10-05。只登记公开可达的具体根因，不创建 RV 编号，不改业务代码。**新增探针尚未由本子任务执行**；下列动态部分必须以主控补跑日志更新，预期红不是实际红。

## FW-WORKING-TREE-PROVIDER — P1：React 换库后工作树状态仍归属旧库

- **对象 / 可达性**：`@aiao/rxdb-plugin-working-tree-react` 的公开 `useWorkingTree()` 放在公开 `RxDBProvider db={database}` 下，保持同一组件实例、将 `database` 从 A 替换为 B。不是私有路径调用；provider 接受不同实例。
- **源码锚点**：`packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:84–95`。`database` 变化会重建 commands，但十二格 `useState` 不随数据库重置，`patch` 是跨库共享的稳定闭包。`packages/rxdb-react/src/rxdb-react.tsx:192–248` 的直接实例 provider 会向同一消费者发布新库。依赖 `packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:125–137,205–211` 的 generation 只在**同一个 commands 实例**内按 key 递增，不使旧实例失效。
- **时序复验**：① A.status()/diff() 成功 → provider 切 B、不发 B 查询 → B 消费者仍看到 A 的 success/value；② A.isEnabled() pending → 切 B → B.isEnabled() 返回 false → A 返回 true → 旧 commands 的 patch 覆盖 B 已完成的状态。十二格使用同一机制，diff/listCommits 亦会残留旧库历史结果。
- **实际动态证据**：等待主控。新增 `packages/rxdb-plugin-working-tree-react/src/__tests__/review-parallel-provider-switch.spec.ts` 两条正常回归断言，不使用 `it.fails` / skip。核心 IO 是官方 testing fixture，React 与 provider 为真实框架实现。09:06 的基线 49 个通过用例**没有此探针**，不能把基线绿当作不存在此缺陷。
- **最小修法**：把状态和 state sink 生命周期绑定到 database identity；换库同步暴露新库初态，旧 scope 的 sink 必须失效。保留既有 promise 返回值，不把取消 UI 写回等价成取消已经发出的数据库命令；不要靠让所有消费方加 `key` 掩盖公共 hook 的 ownership。
- **缺口**：等待补跑的确切 assertion；还需 dirty/CAS/restore 中换库和旧 diff 含敏感字段的回归。Vue 的 `useRxDB()` 当前是 snapshot 入口，不把此 React 实例换库根因未经复验泛化为三端同一问题。
- **关联原 C**：React working-tree C1、C2、C4；上述余下场景未取证前仍是 partial。

## FW-REPLAYER-EARLY-SEEK — P2：首个 consumer layout effect 的 seek 被静默吞掉

- **对象 / 可达性**：`@aiao/rxdb-plugin-replay-react` 的公开 `Replayer` / `ReplayerRef`，父组件持 ref 并在首次 `useLayoutEffect` 中调用 `seek(500)`。这是正常 React ref 消费，不是假造 destroyed handle。
- **源码锚点**：`packages/rxdb-plugin-replay-react/src/replayer.tsx:62–78,91–99`。imperative ref 在 layout 阶段可用，而 `mountReplayer` 在 passive `useEffect` 中才建立；`seek` 只做 `handleRef.current?.seek(timeMs)`，没有 pending seek。`replayer.tsx:23` 与 `README.md:65` 明确说明加载完成前 `seek` 会记下目标时刻。
- **时序复验**：组件 commit → imperative ref 安装 → 消费方 layout effect `seek(500)`（handleRef 为 null）→ passive effect `mountReplayer` → 核心没有收到 seek 或 initialTime=500。第一次命令被丢弃。
- **实际动态证据**：等待主控。新增 `packages/rxdb-plugin-replay-react/src/__tests__/review-parallel-layout-seek.spec.ts`，真实 React 渲染/布局时序，仅用已存在的 `MountReplayerSpy` 观察核心边界。断言挂一次播放器后 `argsOf('seek') === [[500]]`；未运行前不冒充失败。原有 StrictMode 测试证明挂载数平衡，**不覆盖**首个 layout 命令。
- **最小修法**：仅在无 handle 时保存最新 pending seek，handle 建立后送达并清空；或在与消费者 layout effect 可对齐的阶段安装核心 handle，并重新检查 SSR/StrictMode。维持 play/pause 加载前空操作的原合同，不为所有命令加隐式队列。
- **缺口**：补跑首个 layout 断言、SSR/StrictMode 初始化以及多 root 隔离；core 已挂载但录制尚未加载完成的 pending seek 与**尚未建立 handle**是两个时段，不能用前者证明后者。
- **关联原 C**：React replay C1、C4、C5；回放错误/并发 restore/键盘等原场景仍须独立证据。

## 当前门禁阻碍（不登记成生产问题）

`rxdb-angular:test` 的 16 个 directive 用例在 `framework-editor-coverage.txt:581–619` 同根因失败：`getEntityStatus` 走真实实现，fakeEntity 无 attached status。测试 `src/__tests__/rxdb-change-detector.directive.spec.ts:15–21,23–26,48–49` 预期 vi.mock 命中；生产 `rxdb-change-detector.directive.ts:99` 按真实实体契约读取 status。`vite.config.mts` 使用 Analog Angular 编译/JIT，`test-setup.ts` 初始化真实 TestBed。尚无证据表明业务 directive 对真实实体错误；应先查编译后的 import 标识和 Vitest mock 边界，主控隔离复跑。不得改业务适配 fakeEntity，亦不得声明 Angular 包或覆盖率完成。
