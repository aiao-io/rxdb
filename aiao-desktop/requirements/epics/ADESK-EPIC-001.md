---
id: ADESK-EPIC-001
status: In Progress
startDate: 2026-11-12
targetDate: TBD
owner: jimmy
---

# 产品工程结构

## 愿景

Aiao Desktop 作为一个多应用产品管理：Angular 桌面与浏览器冒烟各是一个 Nx 应用，产品需求集中在产品根目录，结构、影响范围与安全边界由门禁约束；一条命令启动本地开发，开发导航集中展示入口、状态与常用命令；一条命令发布到 Cloudflare Pages，并确认线上就是刚构建的那一份。

## 目标

- [x] 升级为仓库根的产品根目录，拆成 web 与 e2e 两个应用，门禁覆盖需求结构、影响范围、安全边界与 CI 接入（[ADESK-US-001](../stories/platform/ADESK-US-001-product-root.md)）。
- [x] `pnpm nx dev aiao-desktop` 启动开发服务器并打开开发导航，端口固定（[ADESK-US-002](../stories/platform/ADESK-US-002-local-dev-dashboard.md)）。
- [x] `pnpm nx run aiao-desktop:deploy` 发布到 Cloudflare Pages：产物检查、首次建项目、上传、线上逐文件对账（[ADESK-US-003](../stories/platform/ADESK-US-003-cloudflare-pages-deploy.md)）。
- [ ] 桌面绑定 aiao.io 下的自定义域名并与 Aiao Code 同站（[ADESK-US-004](../stories/platform/ADESK-US-004-custom-domain.md)）。
- [x] 外网内容的来源、用途与会发送的数据在桌面里说清楚，代码里的外网主机清单与说明一致（[ADESK-US-007](../stories/platform/ADESK-US-007-external-content-disclosure.md)）。
- [ ] 冒烟拆成可独立运行的检查组，并提供多页、持久 profile、新旧产物与多引擎夹具（[ADESK-US-008](../stories/platform/ADESK-US-008-smoke-suite.md)）。
- [ ] 按 D-19 只验收桌面 Chrome，覆盖窄屏与触屏核心交互，写明浏览器范围（[ADESK-US-005](../stories/platform/ADESK-US-005-cross-browser-smoke.md)）。
- [x] web 单测接入覆盖率门槛并挡住回退（[ADESK-US-006](../stories/platform/ADESK-US-006-web-test-coverage-gate.md)）。

当前未勾选项包含已经实现、等待验收或依赖关闭的故事，具体保留项见状态总览。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [ADESK-US-001 产品根目录与多应用拆分](../stories/platform/ADESK-US-001-product-root.md) (High)
- [ADESK-US-002 本地开发入口与开发导航](../stories/platform/ADESK-US-002-local-dev-dashboard.md) (Medium)
- [ADESK-US-003 一键发布到 Cloudflare Pages](../stories/platform/ADESK-US-003-cloudflare-pages-deploy.md) (High)
- [ADESK-US-004 绑定自定义域名与同站托管](../stories/platform/ADESK-US-004-custom-domain.md) (Medium)
- [ADESK-US-005 Chrome 与窄屏验收](../stories/platform/ADESK-US-005-cross-browser-smoke.md) (Medium)
- [ADESK-US-006 web 单测覆盖率门槛](../stories/platform/ADESK-US-006-web-test-coverage-gate.md) (Medium)
- [ADESK-US-007 外网内容来源与隐私说明](../stories/platform/ADESK-US-007-external-content-disclosure.md) (High)
- [ADESK-US-008 冒烟套件化](../stories/platform/ADESK-US-008-smoke-suite.md) (High)

## 非目标

- 不改变桌面的产品行为。
- 不为复用提前抽包：眼下没有跨应用共用的代码。
