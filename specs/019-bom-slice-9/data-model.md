# Data Model: 实例安装记录

## BomInstanceNode

| 字段               | 类型        | 规则                                   |
| ------------------ | ----------- | -------------------------------------- |
| id                 | UUID        | 一次安装唯一                           |
| itemRevisionId     | UUID        | 必填，RESTRICT 引用实际修订            |
| parentInstanceId   | UUID/null   | 单父，自引用 RESTRICT，根为空          |
| sourceOccurrenceId | UUID/null   | RESTRICT 引用来源，只有根可空          |
| serialNumber       | string/null | 序列化物料必填且非空，全局安装区间排他 |
| lotCode            | string/null | 实际批次，不参与排他                   |
| installedAt        | Date        | 必填安装起点                           |
| removedAt          | Date/null   | 晚于 installedAt，null 表示未拆卸      |

显式三条外键及序列+安装起点、父、来源、批次、实际修订索引；serialNumber 等值键与 installedAt/removedAt 的 [) 排他。序列索引同时支持点查与排他候选定位。固定事实列禁止改写，拆卸时间接受合法更新。环、自父与序列缺失在写入期拒绝。不创建主数据头/行或可达性记录。

## 查询投影

实例事实增加 itemId/itemNo/revisionNo，日期为 Date。展开增加 depth 与 ID 路径；反查给命中节点、顶层根与祖先节点路径。来源仅输出 ID，不解析浮动修订。
