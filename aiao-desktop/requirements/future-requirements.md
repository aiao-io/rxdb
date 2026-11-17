# Aiao Desktop 后续方向

已立项的方向见 [status-overview](status-overview.md)（状态）与 [roadmap](roadmap.md)（顺序与依赖）；本页保留候选方向与已毕业条目的去向；已立项工作的当前状态以故事为准。

## 当前孵化

先用门禁与冒烟守住产品结构和既有桌面行为（[ADESK-EPIC-001](epics/ADESK-EPIC-001.md)、[ADESK-EPIC-002](epics/ADESK-EPIC-002.md)），再按具体场景扩展。

## 候选方向

以下方向仍需要具体使用场景、能力缺口和独立验收范围后再立故事，不随当前故事自动承诺：

- **运营批准应用目录已立项**：[US-207](stories/application/ADESK-US-207-approved-app-catalog.md) 已完成源码与本地正式构建验收，完整性、版本化入口、精确来源与卸载范围见 [D-22](decisions.md#d-22运营批准目录与版本切换)。初始正式目录为空；真实版本条目仍需运营和发布方提供。

- **用户安装任意 Web 应用**：用户输入网址安装、应用商店、代码签名和批准流程。批准边界仍是 [D-10](decisions.md#d-10应用分三类登记在同一张表里)；这需要独立的安全模型，不是上一条的扩展。
- **Aiao Code 显式复制已毕业**：[US-208](stories/application/ADESK-US-208-aiao-code-file-copy.md) 使用现有 Orbit 文件面板完成单文件/项目 ZIP 复制，单次 512 KiB，两个存储域独立；嵌入本机文件夹输入与取消失败路径已验收。OAuth 弹窗、持续目录句柄、多选和拖放等新增协议仍是候选，需单独定权限与失败语义；本轮不扩大 sandbox，真实账号授权不在自动证据内。
- **外网内容本地化已毕业**：[US-113](stories/desktop/ADESK-US-113-offline-resources.md) 已完成本地壁纸预缓存、实际断网切换及天气地图真实失败、陈旧状态与重试。远程应用与离线世界地图不在本次范围。
- **各内置应用的内部功能逐项验收**：各内置应用目前只验「能打开」，内部功能没有逐项验收（[ADESK-US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md) 只补外壳交互）。立项时不要先铺全部应用：先验 Finder、TextEdit、Notes、Terminal、Preview，逐个定义新建 / 编辑 / 保存 / 失败 / 重开的闭环。

## 使用闭环与数据保障

下面的候选来自对需求完整性的评审：现有故事回答了「怎样打开应用、怎样组织代码、怎样验收」，对「用户完成一项工作、失败以后怎样保住成果」回答得少。它们**不是对当前版本的新增承诺**，最小验收范围是立项草案；前两项建议先于扩大使用范围立项（见 [roadmap](roadmap.md#扩大使用范围的条件)）。

- **本地数据保障（建议最先立项）**
  - 场景：用户已经能把真实的工作成果写进浏览器本地库，而数据只在当前浏览器的这个站点（Origin）下——清除站点数据、换浏览器、换域名都会丢。OPFS 受浏览器配额限制，清除站点数据会清掉它；普通存储与获得持久化授权的存储清理条件不同，所以「刷新后还在」是测试结论，不是数据永久安全。
  - 历史缺口（已由 US-111 处理）：没有备份与导出（[ADESK-US-102](stories/desktop/ADESK-US-102-local-data-and-real-disk.md)、[ADESK-US-106](stories/desktop/ADESK-US-106-database-upgrade-path.md) 都明确排除）；TextEdit 新建保存、关闭保护和冲突处理已按本次授权立项为 [US-109](stories/desktop/ADESK-US-109-document-workflow.md)，其自动验收单独记录；配额不足、存储不可用、Worker 初始化失败、没有 OPFS 的浏览器上的行为没有验收（[D-07](decisions.md#d-07系统数据存在本地-sqlite) 的 IndexedDB 后备只覆盖库文件）；写文件体与写目录行是两步，中断后可能留下孤儿文件体；「抹掉」只重置磁盘卷，用户界面没说清清除了什么、没清什么。
  - 最小验收范围草案：①保存状态（保存中 / 已保存 / 保存失败）可见，失败时编辑内容保留、旧内容不变、存储恢复后可重试，成功后才显示「已保存」；②新建的 TextEdit 文档有保存入口，未保存时关窗或退出有处理选项；③导出：把文件树、文件体、应用记录与偏好导出成一个一致的快照，新浏览器配置导入后内容一致，损坏的包被拒绝且原数据不变，明确不含远程应用在它自己来源下的数据；④存储健康：显示空间估计与不可用状态，容量不足时保存失败不破坏旧内容；⑤「抹掉」的确认、取消与各数据域的清理范围写清（用户文件、各应用记录、系统偏好、游戏 localStorage、终端镜像、远程应用数据分别是否清除），执行被打断后的结果有定义。
  - 解锁条件：定下主要用户与「扩大使用范围」的条件（[roadmap](roadmap.md#扩大使用范围的条件)）；在 [ADESK-US-106](stories/desktop/ADESK-US-106-database-upgrade-path.md) 的升级 / 降级基线之后做范围评审。[ADESK-US-004](stories/platform/ADESK-US-004-custom-domain.md) 的跨域名迁移依赖其中的导出 / 导入。
- **本机文件与虚拟磁盘互通已毕业**：[US-110](stories/desktop/ADESK-US-110-file-management.md) 完成本机批量导入、256 MiB 上限、单文件原字节下载及失败反馈；集成应用复制协作已由 US-208 独立完成本地正式构建验收。
- **冲突与删除恢复已毕业**：[US-109](stories/desktop/ADESK-US-109-document-workflow.md) 完成文档冲突及另存副本，[US-110](stories/desktop/ADESK-US-110-file-management.md) 完成废纸篓恢复、重名保留与原目录失效后的显式选择。后续其他应用冲突按具体场景补齐。
- **文件类型关联与 Open With**：默认打开规则、未知 / 二进制文件的提示、Open With、改名后的类型识别、最近文件失效的处理。现有的 `FileOpener` 与终端 `open` 没有独立的产品契约。
- **应用停止与资源管理已毕业**：[US-112](stories/desktop/ADESK-US-112-runtime-activity.md) 完成真实窗口列表、协商关闭与受控游戏隐藏暂停；D-15 已允许可读生命周期桥接。跨源应用冻结和操作系统资源测量仍不承诺。
- **数据与能力说明入口**：告诉用户本站保存什么、远程应用另存什么、清理会影响什么，权限被拒时在哪里能找到原因。与 [ADESK-US-007](stories/platform/ADESK-US-007-external-content-disclosure.md)（第三方来源说明）并列，不替代它。
- **帮助、命令发现与快捷键替代**：帮助页列出支持范围、保存位置和常见失败；被浏览器或系统占用的快捷键都有菜单或按钮等效的路径（[ADESK-US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md)、[ADESK-US-108](stories/desktop/ADESK-US-108-accessibility.md) 只覆盖一部分）。
- **完整离线**：桌面 PWA 的离线启动与版本更新已由 [ADESK-US-009](stories/platform/ADESK-US-009-pwa.md) 交付并独立断网验收。远程集成应用、外网内容、未下载的终端资源仍需网络；扩大这些离线保证前另行立项，冒烟拦截外网不能代替验收。
