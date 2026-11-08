# 真实网关开发环境截图（历史归档）

这是旧实现的开发环境证据，不作为当前 local-first 应用的正式 origin 验收。2026-10-23，本地 Angular 开发服务、Bun API、PostgreSQL 和 Chrome。使用用户配置的真实图片网关，服务端模型配置为 `gpt-image-2.5`，本次总计生成三张图片。页面内的结果来自实际生成；社区模板缩略图仍保留来源说明。

- [横向生成、本机保存与下载](01-create-landscape.webp)
- [纵向生成、本机保存与下载](02-create-portrait.webp)
- [作品库刷新后恢复](03-library-after-reload.webp)
- [三个画幅的尺寸、耗时与 SHA-256](../../../plans/image-mvp-live-verification.json)

以上是同一后续浏览器上下文中的横向、纵向两张作品。正方形在前一个上下文已生成、保存、下载，实际为 1254×1254；该次脚本因原先断言精确尺寸为 1024×1024 停止，原任务没有重提。原始 PNG、完整报告和未压缩截图保存在本机忽略目录 `tmp/image-mvp-local/`；这里仅归档压缩页面截图与脱敏记录。

这组证据只验证旧实现开发环境中的本地真实链路；当前正式 origin、目标移动设备和 Supabase 同步仍按现行 story 独立验收。
