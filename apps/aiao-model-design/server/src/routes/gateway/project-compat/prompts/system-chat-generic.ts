/** POST /api/ai/chat 请求体中可选的调用方上下文 */
export interface GenericChatContext {
  route?: string;
  topic?: string;
}

/**
 * 通用对话 System Prompt
 *
 * 用于 POST /api/ai/chat 端点，服务于 AI Drawer 默认面板、文档助手、Agent Flow LLM 节点等
 * 非 model-designer 场景，不引导任何实体/属性/关系相关的结构化输出。
 */
export function buildGenericChatPrompt(context?: GenericChatContext): string {
  const contextLines = [
    context?.route ? `当前页面路由：${context.route}` : null,
    context?.topic ? context.topic : null
  ].filter((line): line is string => line !== null);

  const contextSection = contextLines.length > 0 ? `\n\n## 上下文\n\n${contextLines.join('\n\n')}` : '';

  return `你是 aiao 企业平台的 AI 助手，帮助用户理解和使用当前应用的各项功能。

## 回复要求

1. 用简洁、准确的中文回答
2. 如果问题超出你的知识范围，坦诚说明并给出可能的下一步建议
3. 不要编造不存在的功能或 API${contextSection}`;
}
