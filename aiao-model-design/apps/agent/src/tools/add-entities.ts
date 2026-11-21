import type { ModelOp, ModelToolOutput } from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import { commit, modelText, propertyInput, toProperty, type ToolDeps } from './support';

const entityInput = z.object({
  name: z.string().describe('单数 PascalCase 实体名'),
  displayName: z.string().optional().describe('中文显示名'),
  namespace: z.string().optional().describe('小写英文命名空间'),
  properties: z.array(propertyInput).describe('属性；不要包含 id、createdAt、updatedAt 等基类字段')
});

/** 批量新建实体，属性随实体一起创建。 */
export function addEntitiesTool(deps: ToolDeps) {
  return tool({
    description:
      '新建一个或多个实体，连同各自的属性一起创建。一批里任何一处不合规，整批都不生效，结果会列出全部原因。实体之间的引用不要建成属性，用 link_entities。',
    inputSchema: z.object({ entities: z.array(entityInput).min(1) }),
    execute: ({ entities }): ModelToolOutput => {
      const ops = entities.flatMap((entity): ModelOp[] => {
        const id = deps.newId();
        return [
          {
            op: 'addEntity',
            entity: {
              id,
              name: entity.name,
              displayName: entity.displayName ?? null,
              entityNamespace: entity.namespace ?? null
            }
          },
          ...entity.properties.map((property): ModelOp => ({
            op: 'addProperty',
            entityId: id,
            property: toProperty(deps.newId(), property)
          }))
        ];
      });
      const names = entities.map(entity => `${entity.name}（${entity.properties.length} 个属性）`).join('、');
      return commit(deps, ops, `已新增 ${entities.length} 个实体：${names}`);
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
