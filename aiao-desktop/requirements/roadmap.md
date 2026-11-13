# Aiao Desktop 路线图

状态见 [status-overview](status-overview.md)，本页不维护第二份状态。

## 当前批次

前四条故事都已交付：产品根目录与多应用拆分（[ADESK-US-001](stories/platform/ADESK-US-001-product-root.md)）、本地开发入口与开发导航（[ADESK-US-002](stories/platform/ADESK-US-002-local-dev-dashboard.md)），由冒烟守住的桌面外壳与内置应用基线（[ADESK-US-101](stories/desktop/ADESK-US-101-desktop-shell-baseline.md)），以及本地数据与真实磁盘（[ADESK-US-102](stories/desktop/ADESK-US-102-local-data-and-real-disk.md)）：系统与应用数据进本地 SQLite，磁盘是真文件，终端看到并修改同一块磁盘。

应用体系与集成应用（[ADESK-EPIC-003](epics/ADESK-EPIC-003.md)）也已交付：[ADESK-US-201](stories/application/ADESK-US-201-application-system.md)（应用体系与统一登记表）与 [ADESK-US-202](stories/application/ADESK-US-202-integrated-app-runtime.md)（集成应用的运行宿主）由单测与冒烟守住；[ADESK-US-203](stories/application/ADESK-US-203-aiao-code.md) 接入 Aiao Code，2026-11-13 随 Aiao Code 发布到 vscode.aiao.io 后对线上验收通过。Aiao Code 以后每次发布，都要再跑一次 `aiao-desktop-e2e:verify-aiao-code`（[D-13](decisions.md#d-13aiao-code-用线上发布版本)）。没有排期中的故事。

## 立项前提

[future-requirements](future-requirements.md) 里的方向都要先有具体场景、验收范围和对既有冒烟的影响分析，再立故事进入本页。其中正式部署会改变产品边界（对外托管），立项时同步更新 [decisions](decisions.md)；数据落盘已由 [D-07](decisions.md#d-07系统数据存在本地-sqlite) 定案。
