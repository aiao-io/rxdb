import {
  INVERSE_KIND,
  type ModelOp,
  type ModelToolOutput,
  type OnDeleteActionName,
  type RelationKindName,
  type SnapshotEntity
} from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import {
  collect,
  commit,
  failed,
  findEntity,
  modelText,
  onDeleteInput,
  relationKindInput,
  type ToolDeps
} from './support';

const linkInput = z.object({
  from: z.string().describe('关系所在的实体名'),
  to: z.string().describe('目标实体名'),
  kind: relationKindInput.describe('从 from 一侧看的关系种类，如 Customer ONE_TO_MANY Order'),
  name: z.string().optional().describe('from 一侧的关系名，默认按目标实体名生成'),
  inverseName: z.string().optional().describe('to 一侧的逆关系名，默认按 from 实体名生成'),
  onDelete: onDeleteInput.optional().describe('删除策略，落在多对一（或一对一的 from）一侧')
});

type LinkInput = z.infer<typeof linkInput>;

const MANY: ReadonlySet<RelationKindName> = new Set(['ONE_TO_MANY', 'MANY_TO_MANY']);

function plural(word: string): string {
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** 关系的默认名：指向「多」的一端用复数，指向「一」的一端用单数。 */
function defaultName(kind: RelationKindName, target: string): string {
  const word = `${target.charAt(0).toLowerCase()}${target.slice(1)}`;
  return MANY.has(kind) ? plural(word) : word;
}

function onDeleteFor(kind: RelationKindName, onDelete: OnDeleteActionName | undefined): OnDeleteActionName | null {
  return onDelete && (kind === 'MANY_TO_ONE' || kind === 'ONE_TO_ONE') ? onDelete : null;
}

function pairOps(deps: ToolDeps, link: LinkInput, from: SnapshotEntity, to: SnapshotEntity) {
  const inverseKind = INVERSE_KIND[link.kind];
  const ids = { from: deps.newId(), to: deps.newId() };
  const names = {
    from: link.name ?? defaultName(link.kind, to.name),
    to: link.inverseName ?? defaultName(inverseKind, from.name)
  };
  const fromDelete = onDeleteFor(link.kind, link.onDelete);
  const ops: ModelOp[] = [
    {
      op: 'addRelation',
      entityId: from.id,
      relation: {
        id: ids.from,
        name: names.from,
        relationKind: link.kind,
        mappedEntityId: to.id,
        mappedPropertyId: ids.to,
        onDeleteAction: fromDelete
      }
    },
    {
      op: 'addRelation',
      entityId: to.id,
      relation: {
        id: ids.to,
        name: names.to,
        relationKind: inverseKind,
        mappedEntityId: from.id,
        mappedPropertyId: ids.from,
        onDeleteAction: fromDelete ? null : onDeleteFor(inverseKind, link.onDelete)
      }
    }
  ];
  return { ops, line: `已连接 ${from.name}.${names.from} ⇄ ${to.name}.${names.to}（${link.kind}）` };
}

/** 成对建立关系：两端同时创建、互相指向、种类互逆。 */
export function linkEntitiesTool(deps: ToolDeps) {
  return tool({
    description:
      '在实体之间建立关系，一次调用同时创建两端：逆关系、互相引用与逆种类都由工具完成。一次可以建立多条关系。',
    inputSchema: z.object({ links: z.array(linkInput).min(1) }),
    execute: ({ links }): ModelToolOutput => {
      const snapshot = deps.draft.get();
      const found = collect(links.flatMap(link => [findEntity(snapshot, link.from), findEntity(snapshot, link.to)]));
      if (!found.ok) return failed([found.error]);
      const pairs = links.map((link, index) => pairOps(deps, link, found.value[index * 2], found.value[index * 2 + 1]));
      return commit(
        deps,
        pairs.flatMap(pair => pair.ops),
        pairs.map(pair => pair.line).join('\n')
      );
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
