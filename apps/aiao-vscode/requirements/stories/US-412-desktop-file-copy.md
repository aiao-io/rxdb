---
id: US-412
title: 桌面文件复制与嵌入能力边界
status: In Review
priority: High
epic: epic-003-ui-developer-tools
created: 2026-11-17
updated: 2026-11-17
tags: [aiao-vscode, orbit, filesystem]
---

# 桌面文件复制与嵌入能力边界

与桌面侧 [ADESK-US-208](../../../../aiao-desktop/requirements/stories/application/ADESK-US-208-aiao-code-file-copy.md) 同步实施。范围和逐项 AC 以上述故事为准：显式单文件和项目复制、512 KiB 单次边界、两个独立存储域、取消与失败保护、本机文件夹输入，以及嵌入登录的准确提示。保持直接访问的行为，不宣称共享工作区、自动同步或真实账户授权已验收。

本地实现与全部约定 AC 自动验收完成，待评审合并，未发布。逐 AC 对应桌面故事的验收表；[原始证据与命令](../../../../aiao-desktop/requirements/evidence/2026-11-17/README.md)包括 1295 条工作台单测、覆盖率、lint/typecheck、10 项真实构建文件协作检查及六组桌面回归。真实账号授权和线上发布不在此次成功范围。按根 CONVENTIONS，未合并前保持 In Review。
