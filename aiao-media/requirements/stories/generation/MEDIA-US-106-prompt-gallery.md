---
id: MEDIA-US-106
legacyId: aiao-media:US-106
product: aiao-media
title: 图片提示词灵感库与一键套用
status: In Review
priority: Medium
epic: MEDIA-EPIC-002
created: 2026-10-02
updated: 2026-11-14
dependsOn: []
tags: [image, prompts, gallery, web, inspiration, tiptap, template-input]
---

# 用户故事：图片提示词灵感库与一键套用

## 作为/我想要/以便

**作为** 希望从示例开始创作的用户

**我想要** 浏览图片与提示词，套用模板后直接修改正文和参数

**以便** 少做手动搬运，并明确区分参考示例、实际提交文本与真实生成结果

## 范围边界

### In Scope

- `/` 是纯图片的瀑布流首页，提供随应用静态发布的 12 条图片模板，覆盖产品海报、人像头像、插画绘本、创意设计四类用途；支持关键词搜索、分类筛选、完整提示词详情和复制。每条灵感一张按真实宽高比显示的封面卡（标题、作者和「参考示例 / 原创示意」标注），按主区宽度分列并依次放入最矮的一列，手机至少两列；首页不放创作表单，创作入口是侧栏「生成图片」和顶栏「进入创作」。键盘可打开和关闭详情，详情把媒体完整显示在独立的舞台里，另一侧是提示词、来源和套用入口。
- 模板记录稳定 ID、版本、正文、可选参数文档与字段定义、示例图、作者/来源与可用依据。社区参考示例和原创构图示意明确标注，不作为本产品生成结果或模型支持证据；来源未知时不伪造作者或效果承诺。
- 套用前保护当前正文、模板字段值与草稿；已有修改时明确确认替换，取消或校验失败保留原内容。套用只修改创作输入，不调用模型、不上传文件、不切换供应商；本机草稿保存由 MEDIA-US-301 负责。
- Tiptap 使用既有 `PromptInput` 与 `PromptState`，只支持文本、段落、换行、撤销/重做和声明的 `templateField` 行内参数。普通模板直接编辑，参数模板复用既有字段能力，不引入第二套编辑器或通用工具栏。
- `PromptState` 分别保存 `document`、`fields`、`values`；公共模板只读，套用时复制为本机草稿。模板后续更新不覆盖草稿或历史作品的提示词快照。
- 同字段多处引用值一致；必填未填、必填节点被删、未知节点/字段或版本不兼容时，阻止生成和复制最终提示词，保留可编辑状态并给出原因。
- 提交、预览和复制最终提示词统一使用 `serializePrompt()`，不以 `editor.getText()` 代替。只输出正文、换行和字段值，不包含标签、HTML 或 JSON；最终文本限制 2000 个 JavaScript `string.length` 单位，重复字段逐处计数，超限不静默截断。
- 模板切换有独立历史边界，撤销不能回到另一模板。保存回执不反复 `setContent()` 重置光标、组合输入或撤销栈；刷新后恢复正文/字段/画幅，不要求恢复旧撤销栈。
- 外部粘贴只接收文字，花括号或 HTML 字符不自动变成参数，不执行表达式。编辑器与目录资源同源加载，初始化失败保留输入并可重试，销毁时释放编辑器和事件。

### Out of Scope

- 通用富文本编辑、任意 HTML/Markdown 导入、图片/附件嵌入、表达式/条件/循环模板和模板制作后台。
- 用户投稿、收藏/点赞、公开社区、自动抓取第三方内容、自动改写、Tiptap AI/Cloud 与多人协同。
- 视频、GIF 等非静态图片媒体：目录校验当前只收 JPEG 与 SVG；详情的媒体舞台已与文案栏分离，扩展时需同时放宽目录校验、登记封面尺寸并补上对应的详情渲染。
- 参考图上传、自动应用模型/参数或对参考效果复现作保证；模板名出现某模型不代表应用已验证该模型。
- 移动设备真实输入法与文件能力验收。

## 验收标准

| #   | 前置条件                             | 操作                             | 预期结果                                                   | 状态 |
| --- | ------------------------------------ | -------------------------------- | ---------------------------------------------------------- | ---- |
| 1   | 应用目录已加载                       | 浏览、搜索、筛选并查看详情       | 12 条模板覆盖四类用途，可查看完整正文和来源，空结果有说明  | ✅   |
| 2   | 已有正文或修改后的字段               | 套用另一模板并取消替换           | 保留整份编辑状态；确认后只替换草稿，不创建生成任务         | ✅   |
| 3   | 普通模板与参数模板                   | 修改正文、重复字段并预览最终文本 | 内容按顺序展开，不包含节点标签、HTML 或字段 ID             | ✅   |
| 4   | 必填字段缺失、节点非法或最终文本超长 | 尝试复制最终文本或提交           | 明确阻止且保留输入；删除节点不能绕过必填校验               | ✅   |
| 5   | 同一模板内编辑后切换模板             | 撤销/重做与刷新                  | 模板历史不串联；本机正文、字段及画幅可恢复                 | ✅   |
| 6   | 本机草稿收到自身保存回执或跨标签更新 | 继续输入                         | 自身回执不重置编辑器；外部冲突由用户选择，不覆盖未保存输入 | ✅   |
| 7   | 桌面浏览器、真实操作系统中文输入法   | 正文/字段输入、粘贴、撤销重做    | 不丢字、不抢焦点、无布局溢出                               | ✅   |
| 8   | 图片或编辑器资源加载失败             | 查看正文、复制或重试初始化       | 错误可见，输入保留；不把未解析模板作为有效请求提交         | ✅   |
| 9   | 应用目录已加载                       | 在桌面和手机宽度打开 `/`         | 只有图片卡片、多列并排；点开完整显示，Esc 关闭回卡片       | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 技术笔记

当前复用 Tiptap `3.31.3` 最小扩展与同源运行时。`aiao-media:test` 中的提示词状态、焦点与草稿会话测试覆盖序列化及编辑状态；`aiao-media-e2e:local-first-e2e` 验证字段撤销/重做、画幅与字段刷新恢复、模板替换后清空旧撤销历史、真实双标签草稿冲突保留/载入选择，以及图片失败提示与编辑器失败后重试保留输入；见[可靠性验收](../../plans/local-reliability-verification.md)。自身保存回执不重置编辑器另有 `studio-draft-session.spec.ts` 状态机证据。2026-11-14 已通过 macOS 简体拼音与 Chrome 无痕窗口的真实物理按键验收：正文和模板参数均在 `zhong` 组字后跨过自动保存周期，再继续 `guo` 并用空格提交为“中国”；粘贴、撤销/重做、焦点保持、最终文本预览、刷新恢复和桌面布局均通过。正文恢复“中国，正文粘贴验收”，产品字段恢复“中国·字段粘贴验收”，横向画幅保留。见[真实系统输入法记录](../../plans/requirements-completion-20261114.md#真实系统中文输入法)。此前脚本因 `IME_FOCUS_LOST` 中止的记录保留，未计为通过；本次使用原生 UI 工具操作真实系统输入法，没有发送合成 composition 事件。移动端不作为当前关闭条件。全部 9 条 AC 已验，按默认关闭条件进入 In Review，评审/合入仍待完成。

首页瀑布流由 [inspiration-feed.spec.ts](../../../apps/web/src/app/inspiration-feed.spec.ts)（封面比例逐张对照 `public/` 下的图片文件、分列算法）、[element-width.directive.spec.ts](../../../apps/web/src/app/element-width.directive.spec.ts) 和 [discover-feed.spec.ts](../../../apps/web/src/app/discover-feed.spec.ts)（分列、卡片标注、详情、加载失败态、创作页不再含瀑布流）覆盖；`aiao-media-e2e:local-first-e2e` 另验证多列并排、Esc 关闭后焦点回到卡片、离线冷开后六张参考图可解码和手机宽度无横向溢出。

界面参考与静态示例保留在[设计资料](../../design/image-mvp/README.md)；其中三页原型用于布局参考，当前产品另含设置页（供应商、同步、本机数据三个分区），首页已改为纯图片瀑布流，原型里的英雄区与卡片网格仅作历史参考。300 ms 自动保存和 CAS 冲突规则见[本机草稿说明](../local-first/local-first-studio.md)。

2026-11-14 收口复验修复了工作区恢复与短暂禁用导致的正文焦点丢失：导航等待就绪、离开取消、动画帧边界保留请求，恢复时不覆盖用户已选其他控件；相关 28 条回归及原 Chromium 用例连续 20 次通过。见[正文焦点收口记录](../../plans/requirements-completion-20261114.md#正文焦点竞态复验)。真实系统中文输入法已另行完成上述手工验收，AC7 通过。

## 实现文件

- [当前静态模板目录](../../../apps/web/src/app/image-mvp-catalog.ts)
- [目录结构与校验](../../../apps/web/src/app/prompts/prompt-catalog.ts)
- [瀑布流分列与封面比例](../../../apps/web/src/app/inspiration-feed.ts)及[元素宽度观察](../../../apps/web/src/app/element-width.directive.ts)
- [提示词状态与序列化](../../../apps/web/src/app/prompts/prompt-state.ts)及[单元测试](../../../apps/web/src/app/prompts/prompt-state.spec.ts)
- [Tiptap 输入组件](../../../apps/web/src/app/prompts/prompt-input.ts)、[运行时](../../../apps/web/src/app/prompts/prompt-editor-runtime.ts)及[焦点保护](../../../apps/web/src/app/prompts/prompt-focus.ts)
- [草稿会话](../../../apps/web/src/app/prompts/studio-draft-session.ts)
- [编辑器资源构建](../../../apps/web/scripts/build-prompt-assets.mjs)
- [本地应用](../../../apps/web/src/app/local-image-mvp.ts)

## References

- [MEDIA-US-102 图片生成与本机交付](MEDIA-US-102-image-generation.md)
- [MEDIA-US-301 浏览器本地草稿与图片持久化](../local-first/MEDIA-US-301-browser-persistence.md)
- [设计参考图片来源](../../design/image-mvp/assets/SOURCES.md)
- [真实系统输入法验收入口](../../../apps/web-e2e/scripts/desktop-ime-acceptance.mjs)
- [验收记录](../../verification-report.md)
