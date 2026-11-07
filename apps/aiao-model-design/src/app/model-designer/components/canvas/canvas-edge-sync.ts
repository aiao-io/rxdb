import type { DesignEntity, DesignRelation } from '../../models/index.js';
import type { Edge, Graph as GraphType } from '@antv/x6';
import { RELATION_KINDS, RELATION_LABELS } from '../../constants';
import {
  asNodeLike,
  chooseNearestRelationPorts,
  orientRelationPair,
  pairLabel,
  portAbsPoint,
  shouldFlipOneToManyDirection,
  toValidRelationPair
} from './canvas-edge-utils';
import { getEdgeMarkers, normalizeRelationKindForMarker } from './canvas-markers';

/** 期望的边定义 */
interface DesiredEdgeDef {
  sourceCell: string;
  sourcePort: string;
  targetCell: string;
  targetPort: string;
  label: string;
  relationKind: string;
  router?: Parameters<Edge['setRouter']>[0];
  connector?: Parameters<Edge['setConnector']>[0];
}

/** Returns entity fields that can change routing or edge existence. */
export function edgeTopologyKey(entities: DesignEntity[]): string {
  return entities
    .map(entity => `${entity.id}:${entity.extendsBase ?? ''}:${entity.nodeX}:${entity.nodeY}:${entity.nodeWidth}`)
    .sort()
    .join('|');
}

/** Returns edge-affecting relation fields while ignoring array identity changes. */
export function relationTopologyKey(relations: DesignRelation[]): string {
  return relations
    .map(relation =>
      [
        relation.id,
        relation.designEntityId ?? '',
        relation.mappedEntityId ?? '',
        relation.mappedPropertyId ?? '',
        relation.relationKind
      ].join(':')
    )
    .sort()
    .join('|');
}

/** 为 TreeEntityBase 的 parent/children 自关系添加自环边 */
function addTreeSelfEdges(graph: GraphType, entities: DesignEntity[], desiredEdges: Map<string, DesiredEdgeDef>): void {
  for (const entity of entities) {
    if (entity.extendsBase !== 'TreeEntityBase') continue;
    const childrenPortId = `tree:children:${entity.id}`;
    const parentPortId = `tree:parent:${entity.id}`;
    const edgeId = `tree:${entity.id}`;

    const node = asNodeLike(graph.getCellById(entity.id));
    if (!node) continue;

    const childrenL = portAbsPoint(node, `rl:${childrenPortId}`);
    const childrenR = portAbsPoint(node, `rr:${childrenPortId}`);
    const parentL = portAbsPoint(node, `rl:${parentPortId}`);
    const parentR = portAbsPoint(node, `rr:${parentPortId}`);

    const candidates = [
      { sp: `rl:${childrenPortId}`, tp: `rl:${parentPortId}`, s: childrenL, t: parentL },
      { sp: `rl:${childrenPortId}`, tp: `rr:${parentPortId}`, s: childrenL, t: parentR },
      { sp: `rr:${childrenPortId}`, tp: `rl:${parentPortId}`, s: childrenR, t: parentL },
      { sp: `rr:${childrenPortId}`, tp: `rr:${parentPortId}`, s: childrenR, t: parentR }
    ];

    let best: { sp: string; tp: string; dist: number } | null = null;
    for (const c of candidates) {
      if (!c.s || !c.t) continue;
      const dx = c.s.x - c.t.x;
      const dy = c.s.y - c.t.y;
      const dist = dx * dx + dy * dy;
      if (!best || dist < best.dist) {
        best = { sp: c.sp, tp: c.tp, dist };
      }
    }

    if (!best) continue;
    const loopAngle = best.sp.startsWith('rl:') ? 180 : 0;
    desiredEdges.set(edgeId, {
      sourceCell: entity.id,
      sourcePort: best.sp,
      targetCell: entity.id,
      targetPort: best.tp,
      label: RELATION_LABELS.ONE_TO_MANY,
      relationKind: RELATION_KINDS.ONE_TO_MANY,
      router: { name: 'loop', args: { width: 50, height: 80, angle: loopAngle } },
      connector: { name: 'jumpover', args: { radius: 6, type: 'arc' } }
    });
  }
}

/** 将关系数据同步到 X6 图的边 */
export function syncGraphEdges(graph: GraphType, relations: DesignRelation[], entities: DesignEntity[]): void {
  const relationById = new Map(relations.map(r => [r.id, r]));
  const desiredEdges = new Map<string, DesiredEdgeDef>();
  const pairPortIndex = new Map<string, number>();
  const processedPairs = new Set<string>();

  for (const rel of relations) {
    const pair = toValidRelationPair(rel, relationById);
    if (!pair) continue;

    const canonical = pair[0].id < pair[1].id ? [pair[0], pair[1]] : [pair[1], pair[0]];
    const edgeId = `pair:${canonical[0].id}|${canonical[1].id}`;
    if (processedPairs.has(edgeId)) continue;
    processedPairs.add(edgeId);

    const oriented = orientRelationPair(pair[0], pair[1]);
    let sourceRel = oriented.source;
    let targetRel = oriented.target;
    let sourceId: string | undefined = sourceRel.designEntityId;
    let targetId: string | undefined = targetRel.designEntityId;
    if (!sourceId || !targetId) continue;

    let sourceNode = asNodeLike(graph.getCellById(sourceId));
    let targetNode = asNodeLike(graph.getCellById(targetId));
    if (!sourceNode || !targetNode) continue;

    // 位置感知翻转：若 ONE 侧实体在 MANY 侧右边，交换方向使箭头从右指向左（N:1）
    let positionFlipped = false;
    if (sourceRel.relationKind === 'ONE_TO_MANY' && targetRel.relationKind === 'MANY_TO_ONE') {
      if (shouldFlipOneToManyDirection(sourceNode, targetNode)) {
        [sourceRel, targetRel] = [targetRel, sourceRel];
        [sourceId, targetId] = [targetId, sourceId];
        [sourceNode, targetNode] = [targetNode, sourceNode];
        positionFlipped = true;
      }
    }

    const entityPairKey = sourceId < targetId ? `${sourceId}|${targetId}` : `${targetId}|${sourceId}`;
    const prefIdx = pairPortIndex.get(entityPairKey) ?? 0;
    pairPortIndex.set(entityPairKey, prefIdx + 1);

    const nearestPorts = chooseNearestRelationPorts(sourceRel, targetRel, sourceNode, targetNode, prefIdx);
    if (!nearestPorts) continue;
    const relationKind = pairLabel(sourceRel, targetRel);
    const label = positionFlipped ? ` ${RELATION_LABELS.MANY_TO_ONE} ` : ` ${relationKind} `;
    desiredEdges.set(edgeId, {
      sourceCell: sourceId,
      sourcePort: nearestPorts.sourcePort,
      targetCell: targetId,
      targetPort: nearestPorts.targetPort,
      label,
      relationKind: normalizeRelationKindForMarker(sourceRel.relationKind, targetRel.relationKind)
    });
  }

  addTreeSelfEdges(graph, entities, desiredEdges);

  for (const edge of graph.getEdges()) {
    if (!desiredEdges.has(edge.id)) edge.remove();
  }

  for (const [edgeId, def] of desiredEdges) {
    const existing = graph.getCellById(edgeId) as Edge | null;
    if (existing) {
      const curSrc = existing.getSource() as { cell?: string; port?: string };
      const curTgt = existing.getTarget() as { cell?: string; port?: string };
      if (curSrc.cell !== def.sourceCell || curSrc.port !== def.sourcePort) {
        existing.setSource({ cell: def.sourceCell, port: def.sourcePort });
      }
      if (curTgt.cell !== def.targetCell || curTgt.port !== def.targetPort) {
        existing.setTarget({ cell: def.targetCell, port: def.targetPort });
      }
      if (def.router) existing.setRouter(def.router);
      if (def.connector) existing.setConnector(def.connector);
      const storedKind = existing.getData<{ relationKind: string }>()?.relationKind;
      if (storedKind !== def.relationKind) {
        existing.setData({ relationKind: def.relationKind });
        const markers = getEdgeMarkers(def.relationKind);
        // @ts-expect-error X6 marker types are complex
        existing.attr('line/sourceMarker', markers.sourceMarker);
        // @ts-expect-error X6 marker types are complex
        existing.attr('line/targetMarker', markers.targetMarker);
      }
      const curLabel = existing.getLabelAt(0)?.attrs?.['text']?.['text'];
      if (curLabel !== def.label) {
        existing.setLabelAt(0, { attrs: { text: { text: def.label } } });
      }
      continue;
    }

    const markers = getEdgeMarkers(def.relationKind);
    graph.addEdge({
      id: edgeId,
      shape: 'er-relationship',
      source: { cell: def.sourceCell, port: def.sourcePort },
      target: { cell: def.targetCell, port: def.targetPort },
      ...(def.router && { router: def.router }),
      ...(def.connector && { connector: def.connector }),
      data: { relationKind: def.relationKind },
      attrs: { line: { sourceMarker: markers.sourceMarker, targetMarker: markers.targetMarker } },
      labels: [{ attrs: { text: { text: def.label } } }]
    });
  }
}
