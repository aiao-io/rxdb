# Aiao Desktop 后续方向

已立项的方向见 [status-overview](status-overview.md)（状态）与 [roadmap](roadmap.md)（顺序与依赖）；本页只收尚未立项的候选方向。

## 当前孵化

先用门禁与冒烟守住产品结构和既有桌面行为（[ADESK-EPIC-001](epics/ADESK-EPIC-001.md)、[ADESK-EPIC-002](epics/ADESK-EPIC-002.md)），再按具体场景扩展。

## 候选方向

以下方向仍需要具体使用场景、能力缺口和独立验收范围后再立故事，不随当前故事自动承诺：

- **运营批准的应用目录（安装、更新、卸载与回退）**：运营发布的目录是一份静态清单（随桌面发布或托管在运营的 HTTPS 地址，不含密钥），叠加在构建清单之上；安装结果（安装集与版本）存本地 SQLite；目录界面复用现有 App Store 应用。立项前要先定下四件事：
  1. 目录完整性：怎样证明目录文件是运营批准的（同源托管、哈希或签名）。[ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 的 `filesystem`、`notification` 等能力会授给目录里的应用，目录被篡改就等于授权被篡改。
  2. 运行时来源白名单：Orbit 的允许来源现在从构建期登记表推导（[ADESK-US-201](stories/application/ADESK-US-201-application-system.md) #3），运行时目录需要动态白名单，且仍只放行精确的 HTTPS 来源。
  3. 版本化入口：[D-13](decisions.md#d-13aiao-code-用线上发布版本) 里的线上应用是「发布即生效」的单一入口，回退到上一版本要求应用发布方提供不可变的版本化入口，这条要加进 [D-12](decisions.md#d-12集成应用的接入契约) 的接入契约。
  4. 卸载语义：应用自己来源下的数据（IndexedDB、OPFS）桌面清不掉，卸载只移除入口与授权，界面上要说明。

  验收口径的草稿：安装后入口出现在 Applications、Launchpad、Spotlight 与 Dock，打开后经 Orbit 运行，入口与权限来自目录且经 D-12 校验；更新后刷新仍是新版本；卸载后入口消失、已开窗口关闭后不可再开、不删用户文件；目录不可达时已安装应用照常打开、目录页给出失败与重试；非法条目被拒绝并记录，不影响其余条目；回退后入口与权限回到上一版本。

- **用户安装任意 Web 应用**：用户输入网址安装、应用商店、代码签名和批准流程。批准边界仍是 [D-10](decisions.md#d-10应用分三类登记在同一张表里)；这需要独立的安全模型，不是上一条的扩展。
- **扩展宿主能力**：在 [ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 的最小能力集之外，继续增加 OAuth 弹窗（Aiao Code 在桌面里登录 GitHub 需要）、目录选择与目录句柄（Aiao Code 导入文件夹需要）、多选和拖放数据通道等；每项先定 Orbit 请求名、权限与失败语义（[D-12](decisions.md#d-12集成应用的接入契约)）。
- **外网内容本地化**：壁纸随构建分发；地图与天气在无网时给出明确的占位说明。外网内容的来源与隐私说明已立项（[ADESK-US-007](stories/platform/ADESK-US-007-external-content-disclosure.md)），本地化不在其中。
- **各内置应用的内部功能逐项验收**：各内置应用目前只验「能打开」，内部功能没有逐项验收（[ADESK-US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md) 只补外壳交互）。
