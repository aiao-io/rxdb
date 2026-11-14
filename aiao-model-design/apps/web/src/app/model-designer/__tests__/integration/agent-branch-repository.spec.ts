import { sampleShop } from '@aiao-model-design/model-ops/testing';
import { RxDB } from '@aiao/rxdb';
import '@angular/compiler';
import { Injector } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentBranch, AgentConversation } from '../../models/index.js';
import { AgentConversationRepository } from '../../services/agent-conversation-repository';
import { createTestDatabase } from './sqlite-database';

describe('AI 分支的 fork 记录（真实 RxDB）', () => {
  let repository: AgentConversationRepository;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    const testDatabase = await createTestDatabase([AgentConversation, AgentBranch]);
    dispose = testDatabase.dispose;
    repository = Injector.create({
      providers: [{ provide: RxDB, useValue: testDatabase.database }, AgentConversationRepository]
    }).get(AgentConversationRepository);
  });

  afterEach(async () => {
    await dispose();
  });

  it('按分支 ID 保存、读回与删除，fork 前的快照原样保留', async () => {
    const record = { branchId: 'ai-abc', parentBranchId: 'main', modelDesignId: 'design-1', forkBase: sampleShop() };
    await repository.saveBranch(record);
    expect(await repository.findBranch('ai-abc')).toEqual(record);
    expect(await repository.findBranch('ai-other')).toBeNull();
    await repository.removeBranch('ai-abc');
    expect(await repository.findBranch('ai-abc')).toBeNull();
  });

  it('删除不存在的记录时什么也不做', async () => {
    await expect(repository.removeBranch('ai-missing')).resolves.toBeUndefined();
  });
});
