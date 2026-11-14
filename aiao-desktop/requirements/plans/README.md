# 计划与验收记录

调研结论、设计拆解、实施计划、真实环境验收记录和历史归档。当前范围与状态以[需求索引](../README.md)、`status-overview.md`、`roadmap.md` 和各 story 为准；这里的记录带日期，不作为当前状态的派生视图。

| 类别     | 回答的问题                                   | 文件名                   |
| -------- | -------------------------------------------- | ------------------------ |
| 调研结论 | 借鉴对象怎么做、哪些适用、哪些不适用         | `<主题>-research.md`     |
| 设计拆解 | 目标模型、当前代码到目标模块的映射、实施切片 | `<主题>-design.md`       |
| 实施计划 | 已确定的方案与任务清单                       | `<主题>-tasks.md`        |
| 验收记录 | 已经验证什么、还缺什么、证据来自哪一层       | `<主题>-verification.md` |
| 历史归档 | 范围调整前的路线图与验收记录，不作为当前证据 | `<主题>-<日期>.md`       |

产品规则写在对应 story；计划记录研究结论、依赖与实施切片，不能代替实现证据。

## 现有记录

- [application-management-design.md](application-management-design.md)：[ADESK-US-205](../stories/application/ADESK-US-205-application-management.md) 与 [ADESK-US-206](../stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 的设计拆解，含当前代码到目标模块的映射和实施切片。

- [2026-11-14 验收收尾评审](acceptance-closeout.md)：历史基线保留、生产发布、真实键盘/VoiceOver及跨浏览器补证。
