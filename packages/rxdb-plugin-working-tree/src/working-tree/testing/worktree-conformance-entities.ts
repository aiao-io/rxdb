/**
 * @fileoverview 检出位一致性套件（US-313）的业务实体。
 *
 * @remarks
 * 调用点把 {@link WORKTREE_CONFORMANCE_ENTITIES} 原样交给 `new RxDB({ entities })`。三张表各管一件事：
 * {@link WorktreeConformanceTask} 覆盖各种列类型的逐行比对（布尔、整数、可空时间、JSON），
 * 它与 {@link WorktreeConformanceLabel} 的多对多覆盖生成的中间表（快照实例自己再生成一份，数据按名字对上），
 * {@link WorktreeConformanceSecret} 覆盖加密列的信封直通。
 */

import type { EntityType, RelationEntitiesObservable } from '@aiao/rxdb';
import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/** 各种列类型都有一列的业务表。 */
@Entity({
  name: 'WorktreeConformanceTask',
  tableName: 'worktree_conformance_tasks',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'done', type: PropertyType.boolean, default: false },
    { name: 'priority', type: PropertyType.integer, nullable: true },
    { name: 'dueAt', type: PropertyType.date, nullable: true },
    { name: 'meta', type: PropertyType.json, nullable: true }
  ],
  relations: [
    {
      name: 'labels',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'WorktreeConformanceLabel',
      mappedProperty: 'tasks'
    }
  ]
})
export class WorktreeConformanceTask extends EntityBase {
  /** 标题 */
  title!: string;
  /** 是否完成 */
  done!: boolean;
  /** 优先级 */
  priority!: number | null;
  /** 截止时间 */
  dueAt!: Date | null;
  /** 任意 JSON */
  meta!: Record<string, unknown> | null;
  /** 多对多：任务上的标签 */
  declare labels$: RelationEntitiesObservable<typeof WorktreeConformanceLabel>;
}

/** 与任务多对多的标签。 */
@Entity({
  name: 'WorktreeConformanceLabel',
  tableName: 'worktree_conformance_labels',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'tasks',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'WorktreeConformanceTask',
      mappedProperty: 'labels'
    }
  ]
})
export class WorktreeConformanceLabel extends EntityBase {
  /** 标签名 */
  name!: string;
  /** 多对多：贴了这个标签的任务 */
  declare tasks$: RelationEntitiesObservable<typeof WorktreeConformanceTask>;
}

/** 带一个加密列的业务表。 */
@Entity({
  name: 'WorktreeConformanceSecret',
  tableName: 'worktree_conformance_secrets',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'note', type: PropertyType.string, encrypted: true }
  ]
})
export class WorktreeConformanceSecret extends EntityBase {
  /** 明文列 */
  title!: string;
  /** 加密列：库里是信封 */
  note!: string;
}

/** 检出位套件调用点要注册的全部业务实体。 */
export const WORKTREE_CONFORMANCE_ENTITIES: readonly EntityType[] = [
  WorktreeConformanceTask,
  WorktreeConformanceLabel,
  WorktreeConformanceSecret
];

/** 套件给密钥环解锁用的 32 字节密钥。 */
export const WORKTREE_CONFORMANCE_KEY: Uint8Array = new Uint8Array(32).fill(7);
