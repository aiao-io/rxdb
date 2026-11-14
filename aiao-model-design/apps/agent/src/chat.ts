import { chat } from '@trigger.dev/sdk/ai';
import { stepCountIs } from 'ai';
import { agentClientData, requireClientData, type AgentClientData } from './client-data';
import { parseAgentDefinition, pickTools } from './definition';
import source from './model-designer.md';
import { agentModel } from './models';
import { injectBeforeLastUser, readbackBlock } from './readback';
import { bindTools, createDraftStore, TOOL_FACTORIES } from './tools';

const definition = parseAgentDefinition(source);

/** 在模块加载时按定义文件挑出工具工厂：清单里有未注册的名称时，部署后启动即失败。 */
const factories = pickTools(TOOL_FACTORIES, definition.tools);

/** 单轮内模型调用的上限，防止工具反复失败时无限循环。 */
const MAX_STEPS = 40;

/** 会话空闲多久后结束本次 run；自建实例没有 checkpoint，空闲的 run 会一直占着 worker。 */
const TURN_TIMEOUT = '15m';

function turnTools(clientData: AgentClientData | undefined) {
  const draft = createDraftStore(requireClientData(clientData).model);
  return bindTools(factories, { draft, newId: () => crypto.randomUUID() });
}

/**
 * 建模智能体：每个会话一个持久的 `chat.agent`。
 *
 * 每轮的草稿以浏览器发来的快照为起点，只活在本轮的工具里；回读块插在最新用户消息之前。
 */
export const modelDesignerAgent = chat.withClientData({ schema: agentClientData }).agent({
  id: definition.name,
  turnTimeout: TURN_TIMEOUT,
  tools: ({ clientData }) => turnTools(clientData),
  prepareMessages: ({ messages, clientData, reason }) =>
    reason === 'run' ? injectBeforeLastUser(messages, readbackBlock(requireClientData(clientData))) : messages,
  run: async ({ messages, tools, signal, streamText }) =>
    streamText({
      model: agentModel(definition.model),
      system: definition.system,
      messages,
      tools,
      abortSignal: signal,
      stopWhen: stepCountIs(MAX_STEPS)
    })
});
