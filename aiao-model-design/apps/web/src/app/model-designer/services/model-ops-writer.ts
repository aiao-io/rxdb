import type { ModelOp } from '@aiao-model-design/model-ops';
import type { RxDB, UUID } from '@aiao/rxdb';
import { firstValueFrom, type Observable } from 'rxjs';
import { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../models/index.js';
import { calculateLayout } from './ai-model-layout';
import { nextSortOrder } from './entity-utils';

type DesignRow = DesignEntity | DesignProperty | DesignRelation | DesignIndex;
type DesignClass = typeof DesignEntity | typeof DesignProperty | typeof DesignRelation | typeof DesignIndex;
type OpOf<K extends ModelOp['op']> = Extract<ModelOp, { op: K }>;
type Step<K extends ModelOp['op']> = (batch: OpsBatch, op: OpOf<K>) => Promise<void> | void;

const CLASSES: readonly DesignClass[] = [DesignEntity, DesignProperty, DesignRelation, DesignIndex];

/** 操作里的 ID 由智能体工具以 `crypto.randomUUID()` 生成，或来自本地快照，在这里收窄成实体的 UUID 类型。 */
function uuid(value: string): UUID {
  return value as UUID;
}

function byField(field: 'modelDesignId' | 'designEntityId', value: string) {
  return { combinator: 'and' as const, rules: [{ field, operator: '=' as const, value }] };
}

async function load<T extends DesignRow>(EntityClass: { get(id: UUID): Observable<T> }, id: string): Promise<T> {
  return firstValueFrom(EntityClass.get(uuid(id))).catch(() => {
    throw new Error(`要修改或删除的对象 ${id} 不存在`);
  });
}

function children(EntityClass: typeof DesignProperty, entityId: string): Promise<DesignProperty[]>;
function children(EntityClass: typeof DesignRelation, entityId: string): Promise<DesignRelation[]>;
function children(EntityClass: typeof DesignIndex, entityId: string): Promise<DesignIndex[]>;
function children(
  EntityClass: typeof DesignProperty | typeof DesignRelation | typeof DesignIndex,
  entityId: string
): Promise<{ sortOrder: string }[]> {
  const where = byField('designEntityId', entityId);
  if (EntityClass === DesignProperty) return firstValueFrom(DesignProperty.find({ where }));
  if (EntityClass === DesignRelation) return firstValueFrom(DesignRelation.find({ where }));
  return firstValueFrom(DesignIndex.find({ where }));
}

/** 一次工具输出对应的写入批次：新建、修改、删除收进同一个 `mutations` 事务。 */
class OpsBatch {
  readonly #sortBases = new Map<string, { sortOrder: string }[]>();
  #positions: { x: number; y: number }[] = [];
  readonly create = new Map<DesignClass, Set<DesignRow>>(CLASSES.map(item => [item, new Set()]));
  readonly update = new Map<DesignClass, Set<DesignRow>>(CLASSES.map(item => [item, new Set()]));
  readonly remove = new Map<DesignClass, Set<DesignRow>>(CLASSES.map(item => [item, new Set()]));

  constructor(
    readonly rxdb: Pick<RxDB, 'entityManager'>,
    readonly designId: string
  ) {}

  /** 预先算好本批新实体在画布上的位置，以及实体的排序基准。 */
  async prepare(ops: readonly ModelOp[]): Promise<void> {
    const existing = await firstValueFrom(DesignEntity.find({ where: byField('modelDesignId', this.designId) }));
    this.#sortBases.set(this.designId, [...existing]);
    this.#positions = calculateLayout(ops.filter(op => op.op === 'addEntity').length, existing);
  }

  nextPosition(): { x: number; y: number } {
    const position = this.#positions.shift();
    if (!position) throw new Error('新实体的画布位置没有预先算出');
    return position;
  }

  /** 同一父级下的下一个排序键；父级的已有子项只读一次，之后随本批新增推进。 */
  async nextSortOrder(key: string, existing: () => Promise<{ sortOrder: string }[]>): Promise<string> {
    const base = this.#sortBases.get(key) ?? [...(await existing())];
    const sortOrder = nextSortOrder(base);
    this.#sortBases.set(key, [...base, { sortOrder }]);
    return sortOrder;
  }

  nextEntitySortOrder(): string {
    const base = this.#sortBases.get(this.designId) ?? [];
    const sortOrder = nextSortOrder(base);
    this.#sortBases.set(this.designId, [...base, { sortOrder }]);
    return sortOrder;
  }

  add<T extends DesignRow>(target: Map<DesignClass, Set<DesignRow>>, EntityClass: DesignClass, row: T): void {
    target.get(EntityClass)?.add(row);
  }

  async commit(): Promise<void> {
    const pick = (source: Map<DesignClass, Set<DesignRow>>) =>
      new Map<unknown, Set<unknown>>([...source].filter(([, rows]) => rows.size > 0));
    await this.rxdb.entityManager.mutations({
      create: pick(this.create),
      update: pick(this.update),
      remove: pick(this.remove)
    } as Parameters<RxDB['entityManager']['mutations']>[0]);
  }
}

const STEPS: { [K in ModelOp['op']]: Step<K> } = {
  addEntity: (batch, { entity }) => {
    const { x, y } = batch.nextPosition();
    const row = batch.rxdb.entityManager.instantiate(DesignEntity, {
      ...entity,
      id: uuid(entity.id),
      modelDesignId: uuid(batch.designId),
      nodeX: x,
      nodeY: y,
      sortOrder: batch.nextEntitySortOrder()
    });
    batch.add(batch.create, DesignEntity, row);
  },
  updateEntity: async (batch, { entityId, changes }) => {
    batch.add(batch.update, DesignEntity, Object.assign(await load(DesignEntity, entityId), changes));
  },
  removeEntity: async (batch, { entityId }) => {
    batch.add(batch.remove, DesignEntity, await load(DesignEntity, entityId));
  },
  addProperty: async (batch, { entityId, property }) => {
    const sortOrder = await batch.nextSortOrder(`property:${entityId}`, () => children(DesignProperty, entityId));
    const row = batch.rxdb.entityManager.instantiate(DesignProperty, {
      ...property,
      id: uuid(property.id),
      designEntityId: uuid(entityId),
      sortOrder
    });
    batch.add(batch.create, DesignProperty, row);
  },
  updateProperty: async (batch, { propertyId, changes }) => {
    batch.add(batch.update, DesignProperty, Object.assign(await load(DesignProperty, propertyId), changes));
  },
  removeProperty: async (batch, { propertyId }) => {
    batch.add(batch.remove, DesignProperty, await load(DesignProperty, propertyId));
  },
  addRelation: async (batch, { entityId, relation }) => {
    const sortOrder = await batch.nextSortOrder(`relation:${entityId}`, () => children(DesignRelation, entityId));
    const row = batch.rxdb.entityManager.instantiate(DesignRelation, {
      ...relation,
      id: uuid(relation.id),
      designEntityId: uuid(entityId),
      sortOrder
    });
    batch.add(batch.create, DesignRelation, row);
  },
  removeRelation: async (batch, { relationId }) => {
    batch.add(batch.remove, DesignRelation, await load(DesignRelation, relationId));
  },
  addIndex: async (batch, { entityId, index }) => {
    const sortOrder = await batch.nextSortOrder(`index:${entityId}`, () => children(DesignIndex, entityId));
    const row = batch.rxdb.entityManager.instantiate(DesignIndex, {
      ...index,
      id: uuid(index.id),
      designEntityId: uuid(entityId),
      sortOrder
    });
    batch.add(batch.create, DesignIndex, row);
  },
  removeIndex: async (batch, { indexId }) => {
    batch.add(batch.remove, DesignIndex, await load(DesignIndex, indexId));
  }
};

function runStep<K extends ModelOp['op']>(batch: OpsBatch, op: OpOf<K>) {
  return (STEPS[op.op] as Step<K>)(batch, op);
}

/**
 * 把一次工具输出的操作写进当前分支，整批在一个事务里完成。
 *
 * 新建对象沿用操作里的 ID；修改与删除按 ID 直接读库，不依赖可能滞后的界面信号。
 * 任何一条找不到目标时整批都不写入，并抛出说明是哪个对象。
 */
export async function writeModelOps(
  rxdb: Pick<RxDB, 'entityManager'>,
  designId: string,
  ops: readonly ModelOp[]
): Promise<void> {
  const batch = new OpsBatch(rxdb, designId);
  await batch.prepare(ops);
  for (const op of ops) await runStep(batch, op);
  await batch.commit();
}
