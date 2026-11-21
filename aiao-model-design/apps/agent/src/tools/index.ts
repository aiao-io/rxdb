import type { Tool } from 'ai';
import { addEntitiesTool } from './add-entities';
import { addIndexTool } from './add-index';
import { addPropertiesTool } from './add-properties';
import { askUserTool } from './ask-user';
import { inspectModelTool } from './inspect-model';
import { linkEntitiesTool } from './link-entities';
import { removeEntitiesTool } from './remove-entities';
import { removeIndexTool } from './remove-index';
import { removePropertiesTool } from './remove-properties';
import type { ToolDeps } from './support';
import { unlinkEntitiesTool } from './unlink-entities';
import { updateEntityTool } from './update-entity';
import { updatePropertiesTool } from './update-properties';
import { validateModelTool } from './validate-model';

export { createDraftStore, type DraftStore, type ToolDeps } from './support';

/** 按本轮依赖创建工具的工厂。 */
export type ToolFactory = (deps: ToolDeps) => Tool;

/**
 * 智能体可以携带的全部工具。
 *
 * `model-designer.md` 的 `tools` 清单决定实际接上哪些；清单里出现这里没有的名称时启动即失败。
 */
export const TOOL_FACTORIES = {
  inspect_model: inspectModelTool,
  add_entities: addEntitiesTool,
  update_entity: updateEntityTool,
  remove_entities: removeEntitiesTool,
  add_properties: addPropertiesTool,
  update_properties: updatePropertiesTool,
  remove_properties: removePropertiesTool,
  link_entities: linkEntitiesTool,
  unlink_entities: unlinkEntitiesTool,
  add_index: addIndexTool,
  remove_index: removeIndexTool,
  validate_model: validateModelTool,
  ask_user: () => askUserTool
} satisfies Record<string, ToolFactory>;

/** 已注册的工具名。 */
export type ModelToolName = keyof typeof TOOL_FACTORIES;

/** 用本轮的依赖把工厂绑定成工具实例。 */
export function bindTools<F extends Record<string, ToolFactory>>(
  factories: F,
  deps: ToolDeps
): { [K in keyof F]: ReturnType<F[K]> } {
  return Object.fromEntries(Object.entries(factories).map(([name, create]) => [name, create(deps)])) as {
    [K in keyof F]: ReturnType<F[K]>;
  };
}

/** 绑定全部已注册工具。 */
export function createToolRegistry(deps: ToolDeps) {
  return bindTools(TOOL_FACTORIES, deps);
}
