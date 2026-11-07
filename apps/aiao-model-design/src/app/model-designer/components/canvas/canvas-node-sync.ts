import type { DesignEntity, DesignProperty, DesignRelation } from '../../models/index.js';
import type { Graph as GraphType, Selection as SelectionType } from '@antv/x6';
import type { EntityNodeField, InteractionMode } from '../../interfaces/designer.interface';
import {
  EXTENDS_BASE_HEIGHT,
  FIELD_HEIGHT,
  GROUP_HEADER,
  GROUP_PADDING,
  NS_PREFIX,
  PORT_Y_START,
  RELATION_HEADER_HEIGHT
} from './canvas-constants';
import { asNodeLike, nodeChildren, type X6NodeLike } from './canvas-edge-utils';
import { toNodeData } from './canvas-node-data';

/** 同步 X6 Selection 插件以匹配外部的 selectedEntityIds 信号 */
export function syncGraphSelection(
  graph: GraphType,
  selection: SelectionType | undefined,
  selectedIds: ReadonlySet<string>,
  interactionMode: InteractionMode
): void {
  if (!selection) return;

  const inMoveMode = interactionMode === 'move';

  // move 模式单选：不使用 X6 选框（卡片 CSS 已提供选中视觉）
  // select 模式单选：保持 X6 同步，使 metaKey+click toggle 正常工作
  if (selectedIds.size === 0 || (inMoveMode && selectedIds.size === 1)) {
    graph.cleanSelection();
    return;
  }

  // move 模式下短暂 enable，让 graph.select/unselect 渲染选框后再 disable，
  // 避免与 panning 及 rubberband 事件冲突。
  if (inMoveMode) selection.enable();

  const currentSelected = new Set(graph.getSelectedCells().map(c => c.id));
  const needSelect = [...selectedIds].filter(id => !currentSelected.has(id));
  const needDeselect = [...currentSelected].filter(id => !selectedIds.has(id));
  for (const id of needDeselect) {
    const cell = graph.getCellById(id);
    if (cell) graph.unselect(cell);
  }
  for (const id of needSelect) {
    const cell = graph.getCellById(id);
    if (cell) graph.select(cell);
  }

  if (inMoveMode) selection.disable();
}

/** 调整 namespace group 的大小以包裹其子节点 */
export function fitGroupToChildren(graph: GraphType, groupId: string): void {
  const groupNode = asNodeLike(graph.getCellById(groupId));
  if (!groupNode || !groupNode.isNode?.()) return;

  const childNodes = nodeChildren(groupNode).filter(node => node.isNode?.());
  if (childNodes.length === 0) return;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const child of childNodes) {
    const pos = child.getPosition?.();
    const size = child.getSize?.();
    if (!pos || !size) continue;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + size.width);
    maxY = Math.max(maxY, pos.y + size.height);
  }
  if (!Number.isFinite(minX)) return;

  groupNode.setPosition?.(minX - GROUP_PADDING, minY - GROUP_PADDING - GROUP_HEADER, { deep: false });
  groupNode.setSize?.(
    Math.max(maxX - minX + GROUP_PADDING * 2, 120),
    Math.max(maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER, 60)
  );
}

/** 同步字段端口（relation 端口，用于连线）+ 节点级 connect ports */
export function syncFieldPorts(
  node: X6NodeLike,
  fields: EntityNodeField[],
  nodeWidth: number,
  nodeHeight: number,
  hasExtendsBase: boolean
): void {
  const propertyFields = fields.filter(f => f.category !== 'relation');
  const relationFields = fields.filter(f => f.category === 'relation');
  const desiredPorts = new Map<string, { group: string; args: { x: number; y: number } }>();

  const yOffset = PORT_Y_START + (hasExtendsBase ? EXTENDS_BASE_HEIGHT : 0);
  const relationYStart =
    yOffset + propertyFields.length * FIELD_HEIGHT + (relationFields.length > 0 ? RELATION_HEADER_HEIGHT : 0);
  for (let i = 0; i < relationFields.length; i++) {
    const field = relationFields[i];
    const portKey = field.id ?? field.name;
    const y = relationYStart + i * FIELD_HEIGHT + FIELD_HEIGHT / 2;
    desiredPorts.set(`rl:${portKey}`, { group: 'field-left', args: { x: 0, y } });
    desiredPorts.set(`rr:${portKey}`, { group: 'field-right', args: { x: nodeWidth, y } });
  }

  const midY = Math.max(nodeHeight / 2, PORT_Y_START);
  desiredPorts.set('entity:left', { group: 'entity-left', args: { x: 0, y: midY } });
  desiredPorts.set('entity:right', { group: 'entity-right', args: { x: nodeWidth, y: midY } });

  const currentPorts = new Map((node.getPorts?.() ?? []).map(port => [port.id, port]));
  for (const port of currentPorts.values()) {
    if (!desiredPorts.has(port.id)) node.removePort?.(port.id);
  }

  for (const [id, desired] of desiredPorts) {
    const current = currentPorts.get(id);
    if (!current) {
      node.addPort?.({ id, ...desired });
      continue;
    }
    if (current.args?.x === desired.args.x && current.args?.y === desired.args.y) continue;
    node.setPortProp?.(id, 'args', desired.args);
  }
}

/** 更新画布主题（深色/浅色） */
export function updateGraphTheme(graph: GraphType, isDark: boolean): void {
  const gridColor = isDark ? 'rgba(128, 128, 128, 0.3)' : 'rgba(128, 128, 128, 0.4)';
  graph.drawGrid({ type: 'dot', args: { color: gridColor, thickness: 1 } });

  const groupFill = isDark ? 'rgba(95, 149, 255, 0.08)' : 'rgba(95, 149, 255, 0.05)';
  const groupStroke = isDark ? '#4080c0' : '#5F95FF';
  for (const node of graph.getNodes()) {
    if (node.id.startsWith(NS_PREFIX)) {
      node.setAttrByPath('body/fill', groupFill);
      node.setAttrByPath('body/stroke', groupStroke);
      node.setAttrByPath('label/fill', groupStroke);
    }
  }
}

/** 根据缩放级别调整 namespace group 的字体大小 */
export function updateNamespaceFontSize(graph: GraphType, zoom: number): void {
  const baseSize = 16;
  const minSize = 16;
  const maxSize = 48;
  const fontSize = Math.min(maxSize, Math.max(minSize, Math.round(baseSize / zoom)));
  for (const node of graph.getNodes()) {
    if (node.id.startsWith(NS_PREFIX)) {
      node.setAttrByPath('label/fontSize', fontSize);
    }
  }
}

/** 将实体数据同步到 X6 图的节点 */
export function syncGraphNodes(
  graph: GraphType,
  entities: DesignEntity[],
  propsMap: Map<string, DesignProperty[]>,
  relMap: Map<string, DesignRelation[]>,
  selectedIds: ReadonlySet<string>,
  invalidRelationIds: ReadonlySet<string>,
  schemaNamespace: string,
  entityNameMap: Map<string, string>,
  invalidPropertyIds: ReadonlySet<string> = new Set(),
  skipPositionIds?: ReadonlySet<string>
): void {
  const entityIds = new Set<string>(entities.map(e => e.id));
  const nsMap = new Map<string, DesignEntity[]>();
  for (const entity of entities) {
    const ns = entity.entityNamespace ?? schemaNamespace;
    const namespaceEntities = nsMap.get(ns) ?? [];
    namespaceEntities.push(entity);
    nsMap.set(ns, namespaceEntities);
  }
  const groupIds = new Set([...nsMap.keys()].map(ns => `${NS_PREFIX}${ns}`));

  for (const node of graph.getNodes()) {
    if (!node.id.startsWith(NS_PREFIX) && !entityIds.has(node.id)) {
      graph.removeNode(node.id);
    }
  }

  for (const ns of nsMap.keys()) {
    const groupId = `${NS_PREFIX}${ns}`;
    const existing = graph.getCellById(groupId);
    if (!existing) {
      graph.addNode({
        id: groupId,
        shape: 'namespace-group',
        x: 0,
        y: 0,
        width: 100,
        height: 60,
        label: ns,
        zIndex: 0
      });
    } else {
      existing.setAttrByPath('label/text', ns);
      existing.setZIndex(0);
    }
  }

  for (const entity of entities) {
    const ns = entity.entityNamespace ?? schemaNamespace;
    const groupId = `${NS_PREFIX}${ns}`;
    const nodeData = toNodeData(
      entity,
      propsMap.get(entity.id) ?? [],
      relMap.get(entity.id) ?? [],
      entityNameMap,
      selectedIds.has(entity.id),
      invalidRelationIds,
      invalidPropertyIds
    );
    const hasRelations = nodeData.fields.some(f => f.category === 'relation');
    const hasExtendsBase = !!entity.extendsBase && entity.extendsBase !== 'EntityBase';
    const nodeHeight = Math.max(
      80,
      40 +
        nodeData.fields.length * FIELD_HEIGHT +
        (hasRelations ? RELATION_HEADER_HEIGHT : 0) +
        (hasExtendsBase ? EXTENDS_BASE_HEIGHT : 0)
    );
    const existing = graph.getCellById(entity.id);

    if (existing) {
      const existingNode = asNodeLike(existing);
      const currentParent = asNodeLike(existingNode?.getParent?.() ?? null);
      const needsReparent = currentParent?.id !== groupId;

      if (needsReparent) {
        const groupNode = asNodeLike(graph.getCellById(groupId));
        if (groupNode) {
          groupNode.addChild?.(existing);
          queueMicrotask(() => fitGroupToChildren(graph, groupId));
        }
        if (currentParent) {
          queueMicrotask(() => fitGroupToChildren(graph, currentParent.id));
        }
      }

      existing.replaceData({ ngArguments: { data: nodeData } }, { silent: false });
      existing.setZIndex(1);
      const currentSize = existing.getProp('size');
      if (currentSize?.height !== nodeHeight && existingNode) {
        existingNode.setSize?.(currentSize?.width ?? entity.nodeWidth ?? 240, nodeHeight);
      }
      const pos = existing.getProp('position');
      if ((pos?.x !== entity.nodeX || pos?.y !== entity.nodeY) && existingNode && !skipPositionIds?.has(entity.id)) {
        existingNode.setPosition?.(entity.nodeX, entity.nodeY);
      }
      if (existingNode) {
        syncFieldPorts(
          existingNode,
          nodeData.fields,
          currentSize?.width ?? entity.nodeWidth ?? 240,
          nodeHeight,
          hasExtendsBase
        );
      }
    } else {
      const node = graph.addNode({
        id: entity.id,
        shape: 'er-entity',
        x: entity.nodeX,
        y: entity.nodeY,
        width: entity.nodeWidth ?? 240,
        height: nodeHeight,
        data: { ngArguments: { data: nodeData } },
        zIndex: 1
      });
      const groupNode = asNodeLike(graph.getCellById(groupId));
      if (groupNode) {
        groupNode.addChild?.(node);
        queueMicrotask(() => fitGroupToChildren(graph, groupId));
      }
      const addedNode = asNodeLike(node);
      if (addedNode) {
        syncFieldPorts(addedNode, nodeData.fields, entity.nodeWidth ?? 240, nodeHeight, hasExtendsBase);
      }
    }
  }

  for (const node of graph.getNodes()) {
    if (node.id.startsWith(NS_PREFIX) && !groupIds.has(node.id)) {
      graph.removeNode(node.id);
    }
  }

  for (const ns of nsMap.keys()) {
    fitGroupToChildren(graph, `${NS_PREFIX}${ns}`);
  }
}
