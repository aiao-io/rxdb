# 主创作区的本机草稿与活查询

本机工作区启动后，主编辑器正文、模板节点、字段值、模板身份与画幅保存在 RxDB 的 `LocalStudioDraft`。无需登录；公共目录保持只读，套用后复制到当前工作区草稿。本机保存不触发生成、上传或 Supabase 同步。

## 本地模型与真相源

[草稿 codec](../../../src/local-data/studio-draft.ts)仅接受文本、paragraph、hardBreak、templateField 及声明的字段/values；未知节点/字段、版本或损坏 JSON 明确拒绝，不执行 HTML 或表达式。未填写必填字段、超出生成文本上限的输入可以先保存，不能据此绕过生成校验；snapshot 有 256 KiB 及节点/字段上限，超限保留页面输入并显示未保存。

[本地 store](../../../src/local-data/browser-media.ts)按固定工作区 ID 隔离，snapshot 与 revision 原子提交，读到损坏数据不以空草稿覆盖，不做内存持久化降级。公开 Repository 活查询只订阅草稿 snapshot；主输入变化不触发整个作品库的大文件扫描。

编辑器与页面共享一份 `PromptState`。数据库保存可恢复文档，最终生成文本由 `serializePrompt()` 派生；当前供应商请求只发送纯文本，不传 JSON 或 HTML。

## 自动保存、冲突与输入法

[草稿会话](../../../src/app/prompts/studio-draft-session.ts)使用 300 ms 防抖和串行写入，区分 loading、ready、dirty、saving、saved、conflict、failed。初始读取期间的新输入不被旧 snapshot 覆盖，自身保存回执不回填编辑器，保留光标、撤销栈与组合输入；旧 revision 事件不倒退当前状态。

跨标签写入在工作区 Web Lock 内 fresh read 并 CAS，不使用可能落后的订阅缓存充当写版本。无本地改动时可接收最新 snapshot；存在未保存输入时保留内容并让用户选择“载入本机最新”或“以当前输入替换”，新的竞争仍应拒绝。BroadcastChannel 只提示变更，不广播正文或凭据。

关闭或切换工作区取消计时器和订阅，迟到结果不能更新另一工作区。刷新或终止不能保证尚未完成防抖的输入已提交；存储失败保留当前输入并支持重试，不以 pagehide/unload 充当保存成功回执。

## 验证

[codec 单测](../../../src/local-data/studio-draft.spec.ts)与[草稿会话单测](../../../src/app/prompts/studio-draft-session.spec.ts)覆盖结构校验、防抖、初始读取竞争、自身保存回执、外部变更、冲突和关闭。`aiao-media-e2e:local-first-e2e` 验证真实 RxDB/wa-sqlite/IndexedDB 的本机草稿刷新恢复；供应商为 fixture。

桌面真实操作系统中文输入法与迁移/回退仍按 [MEDIA-US-301](MEDIA-US-301-browser-persistence.md) 和[验收记录](../../verification-report.md)单独验收；移动设备暂缓，不阻断当前桌面工作。
