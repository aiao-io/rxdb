# Aiao Desktop 路线图

状态见 [status-overview](status-overview.md)，本页不维护第二份状态。

## 当前批次

当前承诺的四条故事都已交付：产品根目录与多应用拆分（[ADESK-US-001](stories/platform/ADESK-US-001-product-root.md)）、本地开发入口与开发导航（[ADESK-US-002](stories/platform/ADESK-US-002-local-dev-dashboard.md)），由冒烟守住的桌面外壳与内置应用基线（[ADESK-US-101](stories/desktop/ADESK-US-101-desktop-shell-baseline.md)），以及本地数据与真实磁盘（[ADESK-US-102](stories/desktop/ADESK-US-102-local-data-and-real-disk.md)）：系统与应用数据进本地 SQLite，磁盘是真文件，终端看到并修改同一块磁盘。没有排期中的故事。

## 立项前提

[future-requirements](future-requirements.md) 里的方向都要先有具体场景、验收范围和对既有冒烟的影响分析，再立故事进入本页。其中正式部署会改变产品边界（对外托管），立项时同步更新 [decisions](decisions.md)；数据落盘已由 [D-07](decisions.md#d-07系统数据存在本地-sqlite) 定案。
