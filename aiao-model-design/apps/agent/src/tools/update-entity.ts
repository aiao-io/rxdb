import type { EntityChanges, ModelToolOutput } from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import { commit, failed, findEntity, modelText, type ToolDeps } from './support';

/** 修改实体的名称、显示名或命名空间。 */
export function updateEntityTool(deps: ToolDeps) {
  return tool({
    description: '修改一个实体的名称、中文显示名或命名空间。namespace 传 null 表示清除命名空间。',
    inputSchema: z.object({
      entity: z.string().describe('当前实体名'),
      rename: z.string().optional().describe('新的 PascalCase 实体名'),
      displayName: z.string().optional(),
      namespace: z.string().nullable().optional()
    }),
    execute: ({ entity, rename, displayName, namespace }): ModelToolOutput => {
      const found = findEntity(deps.draft.get(), entity);
      if (!found.ok) return failed([found.error]);
      const changes: EntityChanges = {
        ...(rename === undefined ? {} : { name: rename }),
        ...(displayName === undefined ? {} : { displayName }),
        ...(namespace === undefined ? {} : { entityNamespace: namespace })
      };
      if (!Object.keys(changes).length) return failed(['没有要修改的字段']);
      return commit(
        deps,
        [{ op: 'updateEntity', entityId: found.value.id, changes }],
        `已修改实体 ${rename ?? entity}`
      );
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
