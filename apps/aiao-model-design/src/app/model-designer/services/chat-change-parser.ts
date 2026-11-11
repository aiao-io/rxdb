import type { ChatChange, ChatChangeProposal } from '../types/ai-schemas';

const CHAT_CHANGE_ACTIONS = [
  'addEntity',
  'modifyEntity',
  'removeEntity',
  'addProperty',
  'modifyProperty',
  'removeProperty',
  'addRelation',
  'modifyRelation',
  'removeRelation',
  'addIndex',
  'removeIndex'
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChatChange(value: unknown): value is ChatChange {
  if (!isRecord(value)) return false;
  const action = value['action'];
  const entityId = value['entityId'];
  const entityName = value['entityName'];
  return (
    typeof action === 'string' &&
    (CHAT_CHANGE_ACTIONS as readonly string[]).includes(action) &&
    typeof entityId === 'string' &&
    typeof entityName === 'string' &&
    isRecord(value['details'])
  );
}

function isChatChangeProposal(value: unknown): value is ChatChangeProposal {
  return (
    isRecord(value) &&
    typeof value['description'] === 'string' &&
    Array.isArray(value['changes']) &&
    value['changes'].every(isChatChange)
  );
}

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
      if (isChatChangeProposal(parsed)) proposals.push(parsed);
    } catch {
      // Malformed JSON — skip
    }
  }

  return proposals;
}
