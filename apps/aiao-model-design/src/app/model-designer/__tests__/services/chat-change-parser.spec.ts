import { describe, expect, it } from 'vitest';
import { parseChatChangeProposals } from '../../services/chat-change-parser';

describe('ChatChangeParser', () => {
  it('should extract single model-change JSON block', () => {
    const text = `好的，我来给 Order 添加软删除。

\`\`\`json:model-change
{
  "description": "添加软删除",
  "changes": [
    { "action": "addProperty", "entityId": "order-id", "entityName": "Order", "details": { "name": "deletedAt", "propertyType": "date" } }
  ]
}
\`\`\`

以上就是我的建议。`;

    const proposals = parseChatChangeProposals(text);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].description).toBe('添加软删除');
    expect(proposals[0].changes).toHaveLength(1);
    expect(proposals[0].changes[0].action).toBe('addProperty');
  });

  it('should extract multiple model-change blocks', () => {
    const text = `第一个变更：

\`\`\`json:model-change
{ "description": "变更1", "changes": [{ "action": "addEntity", "entityId": "audit-id", "entityName": "Audit", "details": {} }] }
\`\`\`

第二个变更：

\`\`\`json:model-change
{ "description": "变更2", "changes": [{ "action": "removeProperty", "entityId": "user-id", "entityName": "User", "details": { "name": "temp" } }] }
\`\`\``;

    const proposals = parseChatChangeProposals(text);
    expect(proposals).toHaveLength(2);
    expect(proposals[0].description).toBe('变更1');
    expect(proposals[1].description).toBe('变更2');
  });

  it('should return empty array when no model-change blocks', () => {
    const text = '这只是普通的文本回复，没有任何变更建议。';
    const proposals = parseChatChangeProposals(text);
    expect(proposals).toHaveLength(0);
  });

  it('should handle malformed JSON gracefully', () => {
    const text = `\`\`\`json:model-change
{ not valid json }
\`\`\``;

    const proposals = parseChatChangeProposals(text);
    expect(proposals).toHaveLength(0);
  });

  it('should ignore regular json code blocks without model-change marker', () => {
    const text = `\`\`\`json
{ "description": "not a proposal", "changes": [] }
\`\`\``;

    const proposals = parseChatChangeProposals(text);
    expect(proposals).toHaveLength(0);
  });

  it('should handle incomplete streaming text with unclosed block', () => {
    const text = `开始变更：

\`\`\`json:model-change
{ "description": "未完成"`;

    const proposals = parseChatChangeProposals(text);
    expect(proposals).toHaveLength(0);
  });

  it.each([
    ['null change', null],
    ['unknown action', { action: 'dropDatabase', entityName: 'User', details: {} }],
    ['missing entity name', { action: 'addEntity', details: {} }],
    ['invalid entity name', { action: 'addEntity', entityName: 42, details: {} }],
    ['invalid entity id', { action: 'addEntity', entityId: 42, entityName: 'User', details: {} }],
    ['invalid details', { action: 'addEntity', entityName: 'User', details: null }],
    ['array details', { action: 'addEntity', entityName: 'User', details: [] }]
  ])('should reject proposal with %s', (_name, change) => {
    const text = `\`\`\`json:model-change
${JSON.stringify({ description: '非法提案', changes: [change] })}
\`\`\``;

    expect(parseChatChangeProposals(text)).toEqual([]);
  });

  it.each([
    ['invalid description', { description: 42, changes: [] }],
    ['invalid changes', { description: '非法提案', changes: {} }]
  ])('should reject proposal with %s', (_name, proposal) => {
    const text = `\`\`\`json:model-change
${JSON.stringify(proposal)}
\`\`\``;

    expect(parseChatChangeProposals(text)).toEqual([]);
  });

  it('should reject proposals that omit entityId', () => {
    const text = `\`\`\`json:model-change
${JSON.stringify({
  description: '兼容旧格式',
  changes: [{ action: 'addEntity', entityName: 'Audit', details: {} }]
})}
\`\`\``;

    expect(parseChatChangeProposals(text)).toEqual([]);
  });
});
