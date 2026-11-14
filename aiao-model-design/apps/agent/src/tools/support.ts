import {
  applyOps,
  type ModelOp,
  type ModelSnapshot,
  type ModelToolOutput,
  ON_DELETE_ACTIONS,
  PROPERTY_TYPES,
  RELATION_KINDS,
  type SnapshotEntity,
  type SnapshotProperty,
  type SnapshotRelation
} from '@aiao-model-design/model-ops';
import type { Tool } from 'ai';
import { z } from 'zod';

type ToolResultOutput = Awaited<ReturnType<NonNullable<Tool['toModelOutput']>>>;

/** 当前轮的草稿：每轮由浏览器快照新建，工具提交成功后推进。 */
export interface DraftStore {
  get(): ModelSnapshot;
  set(next: ModelSnapshot): void;
}

/** 工具的依赖：草稿与 ID 生成器，测试里注入确定的实现。 */
export interface ToolDeps {
  draft: DraftStore;
  newId: () => string;
}

/** 以一个快照为起点的内存草稿。 */
export function createDraftStore(initial: ModelSnapshot): DraftStore {
  let current = initial;
  return {
    get: () => current,
    set: next => {
      current = next;
    }
  };
}

/** 按名称查找的结果：找到给出对象，找不到给出带候选名称的错误。 */
export type Found<T> = { ok: true; value: T } | { ok: false; error: string };

function candidates(names: readonly string[]): string {
  return names.length ? names.join('、') : '（无）';
}

/** 按实体名查找实体。 */
export function findEntity(snapshot: ModelSnapshot, name: string): Found<SnapshotEntity> {
  const value = snapshot.entities.find(entity => entity.name === name);
  if (value) return { ok: true, value };
  return { ok: false, error: `实体 ${name} 不存在，现有实体：${candidates(snapshot.entities.map(item => item.name))}` };
}

/** 按属性名查找属性。 */
export function findProperty(entity: SnapshotEntity, name: string): Found<SnapshotProperty> {
  const value = entity.properties.find(property => property.name === name);
  if (value) return { ok: true, value };
  const names = entity.properties.map(item => item.name);
  return { ok: false, error: `属性 ${entity.name}.${name} 不存在，现有属性：${candidates(names)}` };
}

/** 按关系名查找关系。 */
export function findRelation(entity: SnapshotEntity, name: string): Found<SnapshotRelation> {
  const value = entity.relations.find(relation => relation.name === name);
  if (value) return { ok: true, value };
  const names = entity.relations.map(item => item.name);
  return { ok: false, error: `关系 ${entity.name}.${name} 不存在，现有关系：${candidates(names)}` };
}

/** 收集一组查找结果：全部找到时返回值，否则返回全部错误。 */
export function collect<T>(results: readonly Found<T>[]): Found<T[]> {
  const errors = results.flatMap(result => (result.ok ? [] : [result.error]));
  if (errors.length) return { ok: false, error: errors.join('\n') };
  return { ok: true, value: results.map(result => (result as { ok: true; value: T }).value) };
}

/** 工具输出：失败。 */
export function failed(errors: readonly string[]): ModelToolOutput {
  return { ok: false, errors: [...errors] };
}

/** 对草稿应用一批操作：全部通过才推进草稿并返回 ops，否则返回逐条原因、草稿不变。 */
export function commit(deps: ToolDeps, ops: ModelOp[], summary: string): ModelToolOutput {
  const result = applyOps(deps.draft.get(), ops);
  if (!result.ok) return failed(result.errors.map(error => error.message));
  deps.draft.set(result.snapshot);
  return { ok: true, ops, summary };
}

/** 模型只读 summary 或失败原因，看不到 ops 里的 UUID。 */
export function modelText(output: ModelToolOutput): ToolResultOutput {
  if (output.ok) return { type: 'text', value: output.summary };
  const reasons = output.errors.map(error => `- ${error}`).join('\n');
  return { type: 'text', value: `失败，草稿未改变：\n${reasons}\n按原因修正后重试。` };
}

/** 属性输入：只用名称与业务含义，不含 ID。 */
export const propertyInput = z.object({
  name: z.string().describe('camelCase 属性名'),
  type: z.enum(PROPERTY_TYPES).describe('属性类型'),
  displayName: z.string().optional().describe('中文显示名'),
  required: z.boolean().optional().describe('是否必填，默认 false'),
  nullable: z.boolean().optional().describe('是否允许为空，默认 false'),
  unique: z.boolean().optional().describe('是否唯一，默认 false'),
  default: z.string().optional().describe('默认值，以字符串表示'),
  enumValues: z.array(z.string()).optional().describe('枚举选项，type 为 enum 时必填')
});

/** 由属性输入构造快照属性，ID 由工具生成。 */
export function toProperty(id: string, input: z.infer<typeof propertyInput>): SnapshotProperty {
  return {
    id,
    name: input.name,
    propertyType: input.type,
    displayName: input.displayName ?? null,
    isRequired: input.required ?? false,
    isNullable: input.nullable ?? false,
    isUnique: input.unique ?? false,
    defaultValue: input.default ?? null,
    enumValues: input.enumValues ?? null
  };
}

/** 关系种类输入。 */
export const relationKindInput = z.enum(RELATION_KINDS);

/** 删除策略输入。 */
export const onDeleteInput = z.enum(ON_DELETE_ACTIONS);
