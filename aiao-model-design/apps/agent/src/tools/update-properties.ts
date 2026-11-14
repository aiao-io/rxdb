import {
  type ModelOp,
  type ModelToolOutput,
  PROPERTY_TYPES,
  type PropertyChanges,
  type SnapshotProperty
} from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import { collect, commit, failed, findEntity, findProperty, modelText, type ToolDeps } from './support';

const propertyUpdate = z.object({
  name: z.string().describe('当前属性名'),
  rename: z.string().optional().describe('新的 camelCase 属性名'),
  type: z.enum(PROPERTY_TYPES).optional(),
  displayName: z.string().nullable().optional(),
  required: z.boolean().optional(),
  nullable: z.boolean().optional(),
  unique: z.boolean().optional(),
  default: z.string().nullable().optional().describe('传 null 清除默认值'),
  enumValues: z.array(z.string()).nullable().optional()
});

type PropertyUpdate = z.infer<typeof propertyUpdate>;

function changesOf(current: SnapshotProperty, update: PropertyUpdate): PropertyChanges {
  const leavesEnum = update.type !== undefined && update.type !== 'enum' && current.enumValues !== null;
  const enumValues = update.enumValues === undefined && leavesEnum ? null : update.enumValues;
  const entries: [keyof PropertyChanges, unknown][] = [
    ['name', update.rename],
    ['propertyType', update.type],
    ['displayName', update.displayName],
    ['isRequired', update.required],
    ['isNullable', update.nullable],
    ['isUnique', update.unique],
    ['defaultValue', update.default],
    ['enumValues', enumValues]
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as PropertyChanges;
}

/** 修改已有属性，类型改为非枚举时自动清掉枚举选项。 */
export function updatePropertiesTool(deps: ToolDeps) {
  return tool({
    description:
      '修改一个实体上的一个或多个属性：改名、改类型、必填、可空、唯一、默认值、枚举选项。只传要改的字段；类型从 enum 改为其他类型时会自动清除枚举选项。',
    inputSchema: z.object({ entity: z.string().describe('实体名'), properties: z.array(propertyUpdate).min(1) }),
    execute: ({ entity, properties }): ModelToolOutput => {
      const target = findEntity(deps.draft.get(), entity);
      if (!target.ok) return failed([target.error]);
      const found = collect(properties.map(update => findProperty(target.value, update.name)));
      if (!found.ok) return failed([found.error]);
      const ops = found.value.map((current, index): ModelOp => ({
        op: 'updateProperty',
        entityId: target.value.id,
        propertyId: current.id,
        changes: changesOf(current, properties[index])
      }));
      const names = properties.map(update => update.rename ?? update.name).join('、');
      return commit(deps, ops, `已修改 ${entity} 的属性 ${names}`);
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
