import type { ChatChangeProposal } from '../types/ai-schemas';

/**
 * 从 AI 回复文本中提取 ChatChangeProposal 块
 *
 * 检测 ```json:model-change 标记，提取并解析 JSON。
 * 格式异常时跳过该块，不抛异常。
 */
export function parseChatChangeProposals(text: string): ChatChangeProposal[] {
  const regex = /```json:model-change\s*\n([\s\S]*?)```/g;
  const proposals: ChatChangeProposal[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.description === 'string' && Array.isArray(parsed.changes)) {
        proposals.push(parsed as ChatChangeProposal);
      }
    } catch {
      // Malformed JSON — skip
    }
  }

  return proposals;
}
