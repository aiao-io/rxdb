---
kind: review-execution
created: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
execution: partial
---

# 2026-10-04 第七批：共享编辑器、三框架封装与文件预览

本批实际评审 code-editor 核心、Angular/React/Vue 三端和三个应用消费入口，新增 **两个 P2：RV-056 /RV-057**，更新七对象记录。没有修业务，没有批量核销 C 项；全仓仍为 70 个对象、0 个全对象深审完成。

## 1. 已确认意见

| 意见             | 原实现复验                                                                                | 正常对照与范围                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| RV-056（已修复） | 三端直接 load().then 漏同步 throw；Vue readonly/disabled 初始化也中断，真实编辑区仍可编辑 | 每端 1 failed /1 passed，真实 LanguageDescription/State/View；不是默认语言全部失败 |
| RV-057（已修复） | Angular/Vue 在 Blob.text 返回后缺归属检查，B 标题配 A 内容                                | Angular/Vue 各 1 failed /1 passed；React 同序列 2 passed；不是 OPFS 写坏           |

三端同类 loader 根因只登记一个 RV，两个应用同类预览根因也只登记一个 RV。React 预览已有 key/active 守卫，保留反证，不为了“对称”硬报三端都错。

## 2. 实际源码追踪

- 核心六文件：最小字符串差量、解析 none/not-found/found、description identity、language error 载荷、a11y attributes/autofocus、语言目录覆盖与别名。字符串 offsets 与 UTF-16 回放已补固定种子性质复验。
- Angular：CVA pending write、外部更新的 External/addToHistory(false)、OnChanges compartments、setDisabledState 与 signal disabled 合并、language request/view 代次、Destroy。发现同步异常通道缺口；不把 Angular 的额外 CVA/imperative 兼容面当成其它框架必须复制的接口。
- React：初始 view 所有权、callback refs、StrictMode view identity、语言列表稳定比较、各 useEffect 配置、external value transaction 与 teardown。未发现“没有迟到 request 守卫”的猜测；确认调用本身没进错误协议。
- Vue：mounted 配置顺序、watch、暴露句柄、request/view 代次、语言失败事件。原 CodeEditor.spec 的模拟 CM 不足以观测访问状态，新 spec 用原 CodeMirror 和真实 createApp。
- 应用：三个编辑器/Generator 页面均有真实调用方；生成输入可编辑、输出和文件预览 readonly。没有把只读生成输出猜成跨文件 undo 写坏。继续沿文件预览 previewFile→分类→Blob.text→赋值，确认第二异步段归属缺口。

## 3. 实际任务与计数

| 任务                  | 结果                                                                        | 证据                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 四包原基线            | core 99、Angular 74、React 32、Vue 66 全过，无 skip                         | [日志](evidence/2026-10-04/editor-frameworks/four-packages-baseline.txt)、[计数](evidence/2026-10-04/editor-frameworks/baseline-counts.json)                                                                                              |
| 核心字符串性质/覆盖率 | 107 passed；4,096 对固定种子文本及空串/Unicode/孤立 surrogate/换行/NUL 边界 | [日志](evidence/2026-10-04/editor-frameworks/core-coverage-and-properties.txt)、[summary](evidence/2026-10-04/editor-frameworks/core-coverage-summary.json)、[原覆盖明细](evidence/2026-10-04/editor-frameworks/core-coverage-final.json) |
| 四包最终整包          | 282 passed /3 failed /0 skipped；原 271 条逐例保留且通过                    | [日志](evidence/2026-10-04/editor-frameworks/final-four-package-tests.txt)、[计数](evidence/2026-10-04/editor-frameworks/final-package-counts.json)、[逐例保留](evidence/2026-10-04/editor-frameworks/original-case-retention.json)       |
| 三应用聚焦预览        | Angular/Vue 各 1 failed /1 passed，React 2 passed，合计 2 failed /4 passed  | [日志](evidence/2026-10-04/editor-frameworks/final-preview-probes.txt)、[状态观测](evidence/2026-10-04/editor-frameworks/final-observations.json)                                                                                         |
| 七对象严格 lint       | 通过，--max-warnings=0                                                      | [日志](evidence/2026-10-04/editor-frameworks/final-seven-lint.txt)                                                                                                                                                                        |
| 七对象 typecheck      | 通过                                                                        | [日志](evidence/2026-10-04/editor-frameworks/final-seven-typecheck.txt)                                                                                                                                                                   |

核心 code-editor 是普通包，四指标门槛 80%。本轮 **statements 99.13%、branches 97.95%、functions 100%、lines 100%**，四项通过；summary 包含六个源文件，不拿测试文件或平均数充数。其它三个封装没有本轮完整 coverage 验收，不外推四包覆盖率都达标。

所有动态结论禁本地/远端 Nx 缓存；任务串行/maxWorkers=1。首次应用取证实际执行 78 个 build/typecheck/spec-typecheck 依赖任务；修正过滤器后的聚焦/最终命令才在依赖已经新构建且源未变时跳过依赖。后续 typecheck 仍由真正 tsc/vue-tsc 构建引用。没有拿旧 dist 冒充新源码。

## 4. 测量边界与取证自身错误

- 包测试与预览组件均在 **happy-dom**（核心是 Node）执行。框架、CodeMirror、真实 Blob 参与；预览服务和 Blob.text 交付时序是接缝。不是 Chromium 输入/IME、实际 OPFS/VFS、浏览器权限或辅助技术测试。
- Angular MCP 只发现 Angular21 example，root/generic best-practices 返回 Unexpected response type；以仓库实际 Angular22 peer 与 TestBed/编译结果取证，不把示例 workspace 冒充本轮应用。
- 首次 VueTestUtils mount 会额外重抛 lifecycle error；改用真实 createApp/errorHandler 后，再独立观测 readonly=false/contenteditable=true。旧日志保留：[初始三端](evidence/2026-10-04/editor-frameworks/language-sync-throw-probes.txt)、[真实 Vue runtime](evidence/2026-10-04/editor-frameworks/vue-runtime-language-probe.txt)。没有将工具重抛单独登记为 Vue 产品根因。
- 应用首次 src/**/review-... 过滤器未被 shell/Vitest 递归匹配，三个 test 没收集案例；已经换 basename filter：[初次日志](evidence/2026-10-04/editor-frameworks/preview-epoch-probes.txt)。依赖任务真实执行，不等于业务案例已执行。
- React 正常对照早期有未包在 act 的初始化等待警告，已按生命周期修正；最终没有该警告，未关闭/忽略它。[修正前](evidence/2026-10-04/editor-frameworks/preview-epoch-corrected-filter.txt) 不当作 React 缺陷。

## 5. 未完成，不给假绿

1. 核心 C1 的纯字符串算法边界已有充分证据，但计划还包括 selection/IME、用户同时更新与真实宿主行为，**完整 C1 保持部分执行**；测试名“评审核销”不代表全部 C 清单已经勾选。
2. 三端浏览器选择区/组合输入、ShadowRoot、键盘焦点、屏幕阅读器、SSR 与实际 hydration，完整语言 loader/cache/挂载竞态矩阵。
3. OPFS 未知扩展探测、A→B→A、同路径重开、关闭/卸载、旧异常/finally、迟到 URL 分配与回收；RV-057 只确认 Blob.text 后切文件。
4. 核心 C5/封装 C5 的 npm pack/独立消费与所有声明入口；各应用整包/E2E 不由本轮聚焦测试代验。
5. 其它包/应用按全仓索引继续，既有红测试和意见不删除/skip 来换绿。

[版本/源码指纹](evidence/2026-10-04/editor-frameworks/runtime-and-sources.json) · [当轮任务汇总](evidence/2026-10-04/editor-frameworks/round-results.json) · [交付校验](evidence/2026-10-04/editor-frameworks/delivery-validation.json)。只新增评审复验和文档；不改用户依赖/Cargo/benchmark、不操作暂存区、不自动提交。

## 续评索引：2026-10-05

[加密密钥环初始化取消与真实后端](execution-2026-10-05-encrypted.md)：新增 RV-058（P2），四包记录更新；三个测量面共 6 failed /3 passed，原 encrypted 274 条仍通过。未修改本文件历史结果，未将全对象/完整专题批量标绿。
