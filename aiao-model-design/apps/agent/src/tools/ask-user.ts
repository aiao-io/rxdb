import { tool } from 'ai';
import { z } from 'zod';

/** 用户选中的选项，由浏览器以 `addToolOutput` 回填。 */
export const askUserAnswer = z.object({ optionId: z.string(), label: z.string() });

/**
 * 向用户提问。没有 `execute`：调用后本轮以待处理的工具调用结束，
 * 浏览器展示选项，用户选择后回填结果并开始下一轮。
 */
export const askUserTool = tool({
  description:
    '需求里有会导致模型完全不同的分叉时，向用户提一个问题并给出 2～4 个选项，然后结束本轮等待回答。细节问题按惯例自己决定，不要用它。',
  inputSchema: z.object({
    question: z.string().describe('问题'),
    options: z
      .array(
        z.object({
          id: z.string().describe('选项标识'),
          label: z.string().describe('选项文字'),
          description: z.string().optional().describe('选这一项意味着什么')
        })
      )
      .min(2)
      .max(4)
  }),
  outputSchema: askUserAnswer
});
