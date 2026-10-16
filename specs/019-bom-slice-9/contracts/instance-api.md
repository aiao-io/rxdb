# Instance API

BomInstanceNode 使用既有 save/remove 仓储。换件关闭旧区间后新增记录，不提供维修工单或换件事务 API。

```ts
interface BomInstanceQueryOptions {
  asOfDate?: Date;
  maxDepth?: number;
  maxNodes?: number;
}
interface BomInstanceNodeView {
  id: string;
  itemRevisionId: string;
  itemId: string;
  itemNo: string;
  revisionNo: string;
  parentInstanceId: string | null;
  sourceOccurrenceId: string | null;
  serialNumber: string | null;
  lotCode: string | null;
  installedAt: Date;
  removedAt: Date | null;
}
interface BomInstanceTreeNode extends BomInstanceNodeView {
  depth: number;
  path: string[];
}
interface BomInstanceTreeResult {
  rootId: string;
  nodes: BomInstanceTreeNode[];
  truncated: boolean;
}
interface BomInstanceTraceTarget {
  serialNumber?: string;
  lotCode?: string;
  itemRevisionId?: string;
}
interface BomInstanceTraceMatch {
  node: BomInstanceNodeView;
  root: BomInstanceNodeView;
  path: BomInstanceNodeView[];
}
interface BomInstanceTraceResult {
  matches: BomInstanceTraceMatch[];
  truncated: boolean;
}
rxdb.bom.expandInstance(rootId, options?): Promise<BomInstanceTreeResult>;
rxdb.bom.whereUsedInstance(target, options?): Promise<BomInstanceTraceResult>;
```

- 无 asOfDate 查历史；有时点筛选 installedAt <= t 且 removedAt 为空或 > t，不读系统时钟。
- maxDepth 默认 64（非负整数），maxNodes 默认 10000（正整数）；触顶显式 truncated。
- 反查至少一个非空目标，多个条件 AND；无匹配为空，根不存在为空展开。
- 稳定排序，追溯路径包含根与命中；有时点时整条路径均须有效。
- 查询违约使用 BomInstanceError；存储环不复用主数据 BomCycleError 的 unionOnly 路径。
