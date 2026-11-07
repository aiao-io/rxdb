import type { DesignRelation } from '../../models/index.js';
import { INVERSE_RELATION_KIND, RELATION_LABELS } from '../../constants';

type RelationPortSide = 'left' | 'right';

export type NodePosition = { x: number; y: number };
export type PortArgs = { x?: number; y?: number };
export type NodePort = { id: string; args?: PortArgs };

export type X6NodeLike = {
  id: string;
  isNode?: () => boolean;
  getChildren?: () => unknown[];
  removeChild?: (child: unknown) => void;
  addChild?: (child: unknown) => void;
  getParent?: () => unknown;
  getPosition?: () => NodePosition;
  getSize?: () => { width: number; height: number };
  setPosition?: (x: number, y: number, options?: { deep?: boolean }) => void;
  setSize?: (width: number, height: number) => void;
  getPorts?: () => NodePort[];
  removePort?: (id: string) => void;
  setPortProp?: (id: string, path: string, value: unknown) => void;
  addPort?: (port: { id: string; group: string; args: { x: number; y: number } }) => void;
  getPort?: (id: string) => NodePort | undefined;
};

/** 将未知的 X6 cell 窄化为我们类型化的节点形状 */
export function asNodeLike(cell: unknown): X6NodeLike | null {
  if (!cell || typeof cell !== 'object') return null;
  const candidate = cell as Partial<X6NodeLike>;
  if (typeof candidate.id !== 'string') return null;
  return candidate as X6NodeLike;
}

/** 获取节点的类型化子节点 */
export function nodeChildren(node: X6NodeLike): X6NodeLike[] {
  const children = node.getChildren?.() ?? [];
  return children.map(child => asNodeLike(child)).filter((child): child is X6NodeLike => child !== null);
}

/** 获取父级 namespace-group 的 ID，如果没有则返回 null */
export function parentGroupId(node: unknown, nsPrefix: string): string | null {
  const currentNode = asNodeLike(node);
  if (!currentNode) return null;
  const parent = asNodeLike(currentNode.getParent?.() ?? null);
  if (!parent?.id.startsWith(nsPrefix)) return null;
  return parent.id;
}

/** 验证关系对：双方必须相互引用且关系类型匹配 */
export function toValidRelationPair(
  rel: DesignRelation,
  relationById: Map<string, DesignRelation>
): [DesignRelation, DesignRelation] | null {
  if (!rel.designEntityId || !rel.mappedEntityId || !rel.mappedPropertyId) return null;

  const inverse = relationById.get(rel.mappedPropertyId);
  if (!inverse?.designEntityId) return null;

  if (inverse.mappedPropertyId !== rel.id) return null;
  if (rel.designEntityId !== inverse.mappedEntityId) return null;
  if (inverse.designEntityId !== rel.mappedEntityId) return null;

  const expectedInverse = (INVERSE_RELATION_KIND as Record<string, string>)[rel.relationKind];
  if (!expectedInverse || inverse.relationKind !== expectedInverse) return null;

  return [rel, inverse];
}

/** 调整关系对顺序，使 ONE_TO_MANY 源实体排在前面 */
export function orientRelationPair(
  a: DesignRelation,
  b: DesignRelation
): { source: DesignRelation; target: DesignRelation } {
  if (a.relationKind === 'ONE_TO_MANY' && b.relationKind === 'MANY_TO_ONE') return { source: a, target: b };
  if (a.relationKind === 'MANY_TO_ONE' && b.relationKind === 'ONE_TO_MANY') return { source: b, target: a };
  return a.id < b.id ? { source: a, target: b } : { source: b, target: a };
}

function normalizeRelationKind(kind: string): string {
  return kind === 'MANY_TO_ONE' ? 'ONE_TO_MANY' : kind;
}

/** 获取关系对的边标签 */
export function pairLabel(a: DesignRelation, b: DesignRelation): string {
  const normalized = new Set([normalizeRelationKind(a.relationKind), normalizeRelationKind(b.relationKind)]);
  if (normalized.has('ONE_TO_MANY')) return RELATION_LABELS.ONE_TO_MANY;
  if (normalized.has('MANY_TO_MANY')) return RELATION_LABELS.MANY_TO_MANY;
  return RELATION_LABELS.ONE_TO_ONE;
}

/** 构建关系的端口 ID 字符串 */
export function relationPortId(relId: string, side: RelationPortSide): string {
  return side === 'left' ? `rl:${relId}` : `rr:${relId}`;
}

/** 计算节点上端口的绝对位置 */
export function portAbsPoint(node: X6NodeLike, portId: string): { x: number; y: number } | null {
  const port = node.getPort?.(portId);
  const args = port?.args;
  if (args?.x == null || args?.y == null) return null;
  const pos = node.getPosition?.();
  if (!pos) return null;
  return { x: pos.x + args.x, y: pos.y + args.y };
}

/** 判断基数为 1 的实体是否位于基数为 N 的实体右侧。 */
export function shouldFlipOneToManyDirection(sourceNode: X6NodeLike, targetNode: X6NodeLike): boolean {
  const sourcePos = sourceNode.getPosition?.();
  const sourceSize = sourceNode.getSize?.();
  const targetPos = targetNode.getPosition?.();
  const targetSize = targetNode.getSize?.();
  if (!sourcePos || !sourceSize || !targetPos || !targetSize) return false;

  return sourcePos.x + sourceSize.width / 2 > targetPos.x + targetSize.width / 2;
}

/**
 * 选择源/目标节点之间最合适的左右端口组合。
 *
 * 评分策略（面向避障）：
 * 1. 实体无 X 轴重叠时，优先选彼此面对的一侧（source.right↔target.left 或 source.left↔target.right）
 * 2. 有重叠时，按 X 轴相对方向偏好 facing 侧
 * 3. 同侧出口降权（如 source.left ↔ target.left 需要绕大圈）
 * 4. 距离作为次要 tiebreaker
 */
export function chooseNearestRelationPorts(
  sourceRel: DesignRelation,
  targetRel: DesignRelation,
  sourceNode: X6NodeLike,
  targetNode: X6NodeLike,
  preferIndex = 0
): { sourcePort: string; targetPort: string } | null {
  const sourcePos = sourceNode.getPosition?.();
  const sourceSize = sourceNode.getSize?.();
  const targetPos = targetNode.getPosition?.();
  const targetSize = targetNode.getSize?.();

  // 无位置信息时回退到纯距离排序
  if (!sourcePos || !sourceSize || !targetPos || !targetSize) {
    return chooseNearestFallback(sourceRel, targetRel, sourceNode, targetNode, preferIndex);
  }

  const srcRight = sourcePos.x + sourceSize.width;
  const tgtRight = targetPos.x + targetSize.width;

  // 判断方位关系
  const sourceFullyLeft = srcRight < targetPos.x; // source 在 target 左侧，无 X 重叠
  const sourceFullyRight = tgtRight < sourcePos.x; // source 在 target 右侧，无 X 重叠
  const targetIsRightOfSource = targetPos.x + targetSize.width / 2 >= sourcePos.x + sourceSize.width / 2;

  const candidates: Array<{ sourceSide: RelationPortSide; targetSide: RelationPortSide }> = [
    { sourceSide: 'left', targetSide: 'left' },
    { sourceSide: 'left', targetSide: 'right' },
    { sourceSide: 'right', targetSide: 'left' },
    { sourceSide: 'right', targetSide: 'right' }
  ];

  const scored: Array<{ sourcePort: string; targetPort: string; score: number }> = [];

  for (const c of candidates) {
    const sp = relationPortId(sourceRel.id, c.sourceSide);
    const tp = relationPortId(targetRel.id, c.targetSide);
    const sourcePoint = portAbsPoint(sourceNode, sp);
    const targetPoint = portAbsPoint(targetNode, tp);
    if (!sourcePoint || !targetPoint) continue;

    let score = 0;

    // 1️⃣ 面对侧（无 X 重叠时最强偏好）
    if (sourceFullyLeft && c.sourceSide === 'right' && c.targetSide === 'left') {
      score += 100_000;
    } else if (sourceFullyRight && c.sourceSide === 'left' && c.targetSide === 'right') {
      score += 100_000;
    }
    // 2️⃣ 方向偏好（有重叠时按 X 方位选 facing 侧）
    else if (targetIsRightOfSource) {
      if (c.sourceSide === 'right') score += 10_000;
      if (c.targetSide === 'left') score += 10_000;
    } else {
      if (c.sourceSide === 'left') score += 10_000;
      if (c.targetSide === 'right') score += 10_000;
    }

    // 3️⃣ 同侧出口惩罚（连线需要绕过整个节点）
    if (c.sourceSide === c.targetSide) score -= 50_000;

    // 4️⃣ 距离 tiebreaker（越短越好，归一化到千分位）
    const dx = sourcePoint.x - targetPoint.x;
    const dy = sourcePoint.y - targetPoint.y;
    score -= Math.sqrt(dx * dx + dy * dy) * 0.01;

    scored.push({ sourcePort: sp, targetPort: tp, score });
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);
  const idx = preferIndex % scored.length;
  const pick = scored[idx];
  return { sourcePort: pick.sourcePort, targetPort: pick.targetPort };
}

/** 纯距离排序的回退实现（无位置信息时使用） */
function chooseNearestFallback(
  sourceRel: DesignRelation,
  targetRel: DesignRelation,
  sourceNode: X6NodeLike,
  targetNode: X6NodeLike,
  preferIndex: number
): { sourcePort: string; targetPort: string } | null {
  const candidates: Array<{ sourceSide: RelationPortSide; targetSide: RelationPortSide }> = [
    { sourceSide: 'left', targetSide: 'left' },
    { sourceSide: 'left', targetSide: 'right' },
    { sourceSide: 'right', targetSide: 'left' },
    { sourceSide: 'right', targetSide: 'right' }
  ];

  const scored: Array<{ sourcePort: string; targetPort: string; distance: number }> = [];

  for (const c of candidates) {
    const sp = relationPortId(sourceRel.id, c.sourceSide);
    const tp = relationPortId(targetRel.id, c.targetSide);
    const sourcePoint = portAbsPoint(sourceNode, sp);
    const targetPoint = portAbsPoint(targetNode, tp);
    if (!sourcePoint || !targetPoint) continue;
    const dx = sourcePoint.x - targetPoint.x;
    const dy = sourcePoint.y - targetPoint.y;
    scored.push({ sourcePort: sp, targetPort: tp, distance: dx * dx + dy * dy });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => a.distance - b.distance);
  const idx = preferIndex % scored.length;
  const pick = scored[idx];
  return { sourcePort: pick.sourcePort, targetPort: pick.targetPort };
}
