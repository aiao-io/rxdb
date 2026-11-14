import { sampleShop } from '@aiao-model-design/model-ops/testing';
import { describe, expect, it } from 'vitest';
import { agentClientData, requireClientData } from './client-data';

describe('agentClientData', () => {
  it('Worker 建会话触发的预热不带 clientData，也能通过校验', () => {
    expect(agentClientData.safeParse(undefined).success).toBe(true);
  });

  it('带了就按快照结构校验', () => {
    expect(agentClientData.safeParse({ model: sampleShop(), edits: [] }).success).toBe(true);
    expect(agentClientData.safeParse({ model: { entities: 'x' }, edits: [] }).success).toBe(false);
    expect(agentClientData.safeParse({}).success).toBe(false);
  });

  it('真正开始一轮时必须有快照', () => {
    expect(() => requireClientData(undefined)).toThrow(/本轮缺少模型快照/);
    const data = { model: sampleShop(), edits: ['x'] };
    expect(requireClientData(data)).toBe(data);
  });
});
