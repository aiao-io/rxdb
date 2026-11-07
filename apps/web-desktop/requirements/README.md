# Web Desktop 产品需求

做一个可长期使用的浏览器桌面：同一份应用和数据，支持 macOS 与 Windows 两种交互方式；应用均为独立 Web 应用，由仓内独立维护的 Orbit 运行内核承载。首版面向单人、本地工作，内置文件管理器、文本编辑器和设置，形成真正的文件工作闭环。

产品范围包含 42 条故事、256 条 AC、8 个 Epic。已开始实现仓内运行内核：7 条故事 In Progress，35 条 Backlog，尚无故事完成完整产品验收。运行基础与既有消费迁移见 [实施记录](../../../specs/001-web-desktop-product/runtime-implementation.md)。

## 阅读入口

| 文档                                                                              | 用途                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------- |
| [产品规格](../../../specs/001-web-desktop-product/spec.md)                        | 用户旅程、功能要求、成功指标与默认范围             |
| [交互行为矩阵](interaction-matrix.md)                                             | macOS / Windows 的按钮、菜单、关闭与退出、键盘规则 |
| [状态总览](status-overview.md)                                                    | 全部故事的范围、里程碑与当前状态                   |
| [交付顺序](roadmap.md)                                                            | M0、M1、M2 的准入、依赖与关闭条件                  |
| [决策记录](decisions.md)                                                          | 用户明确要求、默认假设与信任边界                   |
| [调研依据](research.md)                                                           | 外部参考、固定上游源码与仓库现状证据               |
| [能力矩阵](capability-matrix.md)                                                  | 产品能力与对应故事，不把需求当现有能力             |
| [验收台账](verification-report.md)                                                | 支持环境、性能基准与证据层级                       |
| [未来范围](future-requirements.md)                                                | 未承诺方向及进入条件                               |
| [需求质量检查](../../../specs/001-web-desktop-product/checklists/requirements.md) | 文档完整性检查，不代替产品验收                     |
| [应用约定](CONVENTIONS.md)                                                        | 编号、状态、依赖与变更规则                         |

## 用户与任务

- 日常使用者：用熟悉的桌面方式同时打开工具、组织文件、编辑保存，并在重开浏览器后继续已保存工作。
- 应用开发者：以统一协议把 Angular、React、Vue 或其他受控 Web 应用接入桌面，独立构建和部署。
- 平台维护者：在仓内修复和优化运行内核，以可复验的行为、正式产物和真实环境证据发布桌面。

## 故事分组

| 领域        | 能力               | 故事数 | Epic                                          |
| ----------- | ------------------ | ------ | --------------------------------------------- |
| shell       | 双交互模式桌面     | 5      | [DESKTOP-EPIC-001](epics/DESKTOP-EPIC-001.md) |
| window      | 窗口与多任务       | 7      | [DESKTOP-EPIC-002](epics/DESKTOP-EPIC-002.md) |
| application | Web 应用全生命周期 | 6      | [DESKTOP-EPIC-003](epics/DESKTOP-EPIC-003.md) |
| runtime     | 仓内隔离运行内核   | 8      | [DESKTOP-EPIC-004](epics/DESKTOP-EPIC-004.md) |
| integration | 桌面能力与应用协作 | 5      | [DESKTOP-EPIC-005](epics/DESKTOP-EPIC-005.md) |
| workspace   | 本地工作连续性     | 4      | [DESKTOP-EPIC-006](epics/DESKTOP-EPIC-006.md) |
| files       | 文件与真实工作闭环 | 4      | [DESKTOP-EPIC-007](epics/DESKTOP-EPIC-007.md) |
| quality     | 可验证交付与部署   | 3      | [DESKTOP-EPIC-008](epics/DESKTOP-EPIC-008.md) |

## 范围与术语

双模式在真实 macOS 与 Windows 宿主上均可手动选择。模式改变交互行为，不改变应用身份或文件内容。浏览器桌面不接管操作系统，也不运行 exe、dmg 或任意本机程序。

应用指安装定义；实例指独立运行环境；窗口指可操作的外壳；工作区指同一用户的桌面分组。应用可有多个实例，每个实例同时最多一个窗口；macOS 模式允许应用实例没有窗口但仍在运行。首次版本不要求三个框架分别实现整套外壳；三框架对称要求作用于公共接入能力和样例。

安装只接收运营者批准、遵守桌面协议的协作应用。无界式同源运行环境用于减少样式与普通状态污染，不能证明恶意代码被隔离。权限约束桌面服务入口，不限制不可信代码的全部浏览器访问。

用户文件保存在浏览器的桌面虚拟文件系统中；共享文件与应用私有数据分开。离线可用需要完整资源和应用声明。清除浏览器站点数据会影响本地内容，产品提供显式备份导出路径。

## 需求治理

遵循根 [需求管理办法](../../../requirements/README.md) 和 [应用级模板](../../../requirements/app-template/README.md)。使用 DESKTOP 编号，不计入平台 US 数量。跨框架运行内核及其公共包与桌面应用在同一 PR 中统一评审、验证；应用目录存在不表示 Nx 工程已生成。

story 的 YAML status 是唯一真相源；Epic、状态表与路线图均是派生视图。文档检查只证明引用、编号与依赖一致，不能把任何产品 AC 标成通过。
