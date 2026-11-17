---
id: ADESK-US-114
title: 内置内容复制与打印
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-17
updated: 2026-11-17
tags: [desktop, clipboard, print]
dependsOn: [ADESK-US-101, ADESK-US-102]
capabilities: []
---

# 内置内容复制与打印

作为查看桌面文件、邮件和照片的用户，我希望复制和打印实际使用当前内容，并在被浏览器拒绝时得到准确提示，避免按钮只弹出成功文案。

## 范围边界

### In Scope

- Preview 文本 PDF 的全文复制、图片文件名复制；菜单明确复制对象。
- Mail 复制当前邮件的发件人、收件人、主题、时间和正文，不生成不存在的分享链接。
- Photos 复制当前照片的图片地址，入口明确是地址。
- Preview 可显示的文本 PDF/图片和 Mail 当前邮件调用浏览器打印，只包含所选内容，用户文本按纯文本处理。
- 加载中、无选择和内容不可用时准确禁用；剪贴板/打印失败不报成功；操作后释放临时打印资源。

### Out of Scope

- 系统打印机状态、纸张输出确认、真实邮件发送、远端文件共享和视频打印。
- 任意 PDF 解析与编辑、Photos 原图二进制剪贴板。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 可读文本 PDF 或图片 | 打开 Preview 复制菜单并执行 | 精确标明对象，系统剪贴板取得全文或文件名；拒绝时可见失败 | ✅ |
| 2 | 当前邮件或照片 | 执行对应复制 | 系统剪贴板取得当前邮件文本或图片地址；无选择时不可执行 | ✅ |
| 3 | 可打印 Preview 内容或邮件 | 打开浏览器打印 | 仅包含选择内容，保留换行，用户文本不能执行 HTML；不声称已打印 | ✅ |
| 4 | 复制/打印准备失败或加载中 | 执行或尝试操作 | 不报假成功、不泄漏打印资源，能够重试；打印不改源数据 | ✅ |
| 5 | 本地正式构建 | 键盘操作和相关回归 | 菜单可操作、错误可读、原阅读与搜索保持；原始证据归档 | ✅ |

## 验收证据

2026-11-17 完成本地正式构建自动验收，未发布。全部命令、失败迭代与最终日志见[原始证据](../../evidence/2026-11-17/README.md)。

| AC | 正式构建与单测证据 |
| --- | --- |
| 1 | [最终报告](../../evidence/2026-11-17/aiao-content-actions-browser-final.json)：pdfTextInClipboard、imageNameAndPrint、copyFailureAndRecovery，真实读取剪贴板核对内容。 |
| 2 | 同报告 mailTextAndPrint、photoAddressInClipboard；空 Drafts 和无选中照片时禁用，邮件包含实际发收件人、时间、主题、正文。 |
| 3 | 同报告 selectedDocumentPrint、mailTextAndPrint、imageNameAndPrint；调用原生 print 并收到 beforeprint，检查独立文档与图片成功解码。print-document 单测覆盖换行和文本不执行 HTML。 |
| 4 | 同报告 unavailableContentDisabled、copyFailureAndRecovery、printFailureAndCleanup；单测覆盖重复请求、迟到结果、销毁、解码失败，失败立即替换旧成功提示。 |
| 5 | 同报告 keyboardMenu、noViolations，以及 apps/host-capabilities/host-filesystem/a11y/shell-interaction 五组关联回归；MenuList 的 Enter 默认动作已修复，键盘执行后不再重新弹菜单。 |

1534 条单测、逐文件覆盖率、lint/typecheck/需求门禁通过。受控权限拒绝与打印异常不是人工系统弹窗；成功路径仅证明请求浏览器打印，不代表纸张输出。A06 其他缺口继续按台账推进。
