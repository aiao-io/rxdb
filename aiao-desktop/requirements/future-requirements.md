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
- **扩展宿主能力**：在 [ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 的最小能力集之外，继续增加 OAuth 弹窗（Aiao Code 在桌面里登录 GitHub 需要）、目录选择与目录句柄（Aiao Code 导入文件夹需要）、多选和拖放数据通道等；每项先定 Orbit 请求名、权限与失败语义（[D-12](decisions.md#d-12集成应用的接入契约)）。Aiao Code 与桌面文件怎么协作要先决定：复制导入，还是共享虚拟工作区；再定权限、保存同步与退出行为。导入也可以先评估不走句柄 API 的路径——`<input type="file">` 按标准不受 `showDirectoryPicker()` 的跨源限制，但在 Orbit 的 sandbox 里是否可用没有验收（D-12）。
- **外网内容本地化**：壁纸随构建分发；地图与天气在无网时给出明确的占位说明。外网内容的来源与隐私说明已立项（[ADESK-US-007](stories/platform/ADESK-US-007-external-content-disclosure.md)），本地化不在其中。
- **各内置应用的内部功能逐项验收**：各内置应用目前只验「能打开」，内部功能没有逐项验收（[ADESK-US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md) 只补外壳交互）。立项时不要先铺全部应用：先验 Finder、TextEdit、Notes、Terminal、Preview，逐个定义新建 / 编辑 / 保存 / 失败 / 重开的闭环。

## 使用闭环与数据保障

下面的候选来自对需求完整性的评审：现有故事回答了「怎样打开应用、怎样组织代码、怎样验收」，对「用户完成一项工作、失败以后怎样保住成果」回答得少。它们**不是对当前版本的新增承诺**，最小验收范围是立项草案；前两项建议先于扩大使用范围立项（见 [roadmap](roadmap.md#扩大使用范围的条件)）。

- **本地数据保障（建议最先立项）**
  - 场景：用户已经能把真实的工作成果写进浏览器本地库，而数据只在当前浏览器的这个站点（Origin）下——清除站点数据、换浏览器、换域名都会丢。OPFS 受浏览器配额限制，清除站点数据会清掉它；普通存储与获得持久化授权的存储清理条件不同，所以「刷新后还在」是测试结论，不是数据永久安全。
  - 已核实的缺口：没有备份与导出（[ADESK-US-102](stories/desktop/ADESK-US-102-local-data-and-real-disk.md)、[ADESK-US-106](stories/desktop/ADESK-US-106-database-upgrade-path.md) 都明确排除）；TextEdit 新建的文档没有保存入口，关闭窗口不提示未保存；保存失败只弹一条提示，没有验收；配额不足、存储不可用、Worker 初始化失败、没有 OPFS 的浏览器上的行为没有验收（[D-07](decisions.md#d-07系统数据存在本地-sqlite) 的 IndexedDB 后备只覆盖库文件）；写文件体与写目录行是两步，中断后可能留下孤儿文件体；「抹掉」只重置磁盘卷，用户界面没说清清除了什么、没清什么。
  - 最小验收范围草案：①保存状态（保存中 / 已保存 / 保存失败）可见，失败时编辑内容保留、旧内容不变、存储恢复后可重试，成功后才显示「已保存」；②新建的 TextEdit 文档有保存入口，未保存时关窗或退出有处理选项；③导出：把文件树、文件体、应用记录与偏好导出成一个一致的快照，新浏览器配置导入后内容一致，损坏的包被拒绝且原数据不变，明确不含远程应用在它自己来源下的数据；④存储健康：显示空间估计与不可用状态，容量不足时保存失败不破坏旧内容；⑤「抹掉」的确认、取消与各数据域的清理范围写清（用户文件、各应用记录、系统偏好、游戏 localStorage、终端镜像、远程应用数据分别是否清除），执行被打断后的结果有定义。
  - 解锁条件：定下主要用户与「扩大使用范围」的条件（[roadmap](roadmap.md#扩大使用范围的条件)）；在 [ADESK-US-106](stories/desktop/ADESK-US-106-database-upgrade-path.md) 的升级 / 降级基线之后做范围评审。[ADESK-US-004](stories/platform/ADESK-US-004-custom-domain.md) 的跨域名迁移依赖其中的导出 / 导入。
- **本机文件与虚拟磁盘互通**：把本机的一个文本或图片导入虚拟磁盘（重名时选重命名或覆盖），导出后字节一致；大文件上限、取消与失败有反馈。这是桌面自己的导入 / 导出，与集成应用的目录选择分开评估，和上一条共用导出 / 导入的格式与错误语义。
- **冲突与删除恢复**：在 [ADESK-US-105](stories/desktop/ADESK-US-105-multi-tab-sync.md) 的「最后写入生效」之外评估冲突提示与另存副本；废纸篓恢复时原路径失效、重名的处理；永久删除的边界。解锁条件：105 交付并出现真实的冲突案例。
- **文件类型关联与 Open With**：默认打开规则、未知 / 二进制文件的提示、Open With、改名后的类型识别、最近文件失效的处理。现有的 `FileOpener` 与终端 `open` 没有独立的产品契约。
- **应用停止与资源管理**：用户可达的关闭入口与运行状态；受控应用隐藏后的资源策略；游戏最小化后循环照常运行（[D-15](decisions.md#d-15随桌面发布的单文件游戏在同源-iframe-里运行)），要改这一行为得先调整 D-15「原样发布」的约束。[ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 明确不含后台冻结。
- **数据与能力说明入口**：告诉用户本站保存什么、远程应用另存什么、清理会影响什么，权限被拒时在哪里能找到原因。与 [ADESK-US-007](stories/platform/ADESK-US-007-external-content-disclosure.md)（第三方来源说明）并列，不替代它。
- **帮助、命令发现与快捷键替代**：帮助页列出支持范围、保存位置和常见失败；被浏览器或系统占用的快捷键都有菜单或按钮等效的路径（[ADESK-US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md)、[ADESK-US-108](stories/desktop/ADESK-US-108-accessibility.md) 只覆盖一部分）。
- **离线启动与更新处理**：先确认真有这个场景再立项。立项的话，分别验断网后重新加载、应用载荷缺失、更新过程中新旧版本的一致性；冒烟拦截外网请求不能代替这些验收。
