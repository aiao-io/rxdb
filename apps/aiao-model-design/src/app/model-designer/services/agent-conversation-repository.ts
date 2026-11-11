import { RxDB, type UUID } from '@aiao/rxdb';
import { inject, Injectable } from '@angular/core';
import type { ChatSessionPersistedState } from '@trigger.dev/sdk/chat';
import type { UIMessage } from 'ai';
import { firstValueFrom } from 'rxjs';
import type { ModelOp, ModelSnapshot } from '../../../../shared/model-ops/types';
import { AgentBranch, AgentConversation } from '../models/index.js';
import { writeModelOps } from './model-ops-writer';
import { loadModelSnapshot } from './model-snapshot';

/** 一个智能体会话在本地保存的全部状态。 */
export interface ConversationRecord {
  id: string;
  name: string;
  modelDesignId: string;
  messages: UIMessage[];
  /** 已写入 AI 分支的工具调用，重放或续流时据此去重 */
  appliedToolCallIds: string[];
  /** 上一轮结束时的模型快照，下一轮据此计算用户的手动修改 */
  baseline: ModelSnapshot | null;
  /** 上一轮结束时的会话流游标，刷新后从这里续流 */
  cursor: ChatSessionPersistedState | null;
  lastUsedAt: Date;
}

/** 正在预览的 AI 分支：刷新页面后据此恢复合并、丢弃入口与差异预览。 */
export interface AiBranchRecord {
  branchId: string;
  parentBranchId: string;
  modelDesignId: string;
  /** fork 前的模型快照，差异预览以它为起点 */
  forkBase: ModelSnapshot;
}

function toRecord(row: AgentConversation): ConversationRecord {
  return {
    id: row.id,
    name: row.name,
    modelDesignId: row.modelDesignId,
    messages: ((row.transcript as { messages?: UIMessage[] }).messages ?? []).map(message => ({ ...message })),
    appliedToolCallIds: [...row.appliedToolCallIds],
    baseline: (row.baseline as ModelSnapshot | null | undefined) ?? null,
    cursor: (row.cursor as ChatSessionPersistedState | null | undefined) ?? null,
    lastUsedAt: row.lastUsedAt
  };
}

/**
 * 智能体会话的本地存储（`AgentConversation`，`log: false`）。
 *
 * 这类实体保存后不派发 CREATE / UPDATE 事件，所以这里不提供响应式列表，由调用方在增删改后自己维护。
 */
@Injectable()
export class AgentConversationRepository {
  readonly #rxdb = inject(RxDB);

  async list(modelDesignId: string): Promise<ConversationRecord[]> {
    const where = {
      combinator: 'and' as const,
      rules: [{ field: 'modelDesignId' as const, operator: '=' as const, value: modelDesignId }]
    };
    const rows = await firstValueFrom(AgentConversation.find({ where }));
    return rows.map(toRecord).sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime());
  }

  async create(modelDesignId: string, name: string): Promise<ConversationRecord> {
    const row = this.#rxdb.entityManager.instantiate(AgentConversation, {
      name,
      modelDesignId,
      transcript: { messages: [] },
      appliedToolCallIds: [],
      baseline: null,
      cursor: null,
      lastUsedAt: new Date()
    });
    await row.save();
    return toRecord(row);
  }

  async save(record: ConversationRecord): Promise<void> {
    const row = await firstValueFrom(AgentConversation.get(record.id as UUID));
    Object.assign(row, {
      name: record.name,
      transcript: { messages: record.messages },
      appliedToolCallIds: [...record.appliedToolCallIds],
      baseline: record.baseline as unknown as Record<string, unknown> | null,
      cursor: record.cursor as unknown as Record<string, unknown> | null,
      lastUsedAt: record.lastUsedAt
    });
    await row.save();
  }

  async remove(id: string): Promise<void> {
    await (await firstValueFrom(AgentConversation.get(id as UUID))).remove();
  }

  async findBranch(branchId: string): Promise<AiBranchRecord | null> {
    const row = await this.#branchRow(branchId);
    if (!row) return null;
    return {
      branchId: row.branchId,
      parentBranchId: row.parentBranchId,
      modelDesignId: row.modelDesignId,
      forkBase: row.forkBase as unknown as ModelSnapshot
    };
  }

  async saveBranch(record: AiBranchRecord): Promise<void> {
    const row = this.#rxdb.entityManager.instantiate(AgentBranch, {
      ...record,
      forkBase: record.forkBase as unknown as Record<string, unknown>
    });
    await row.save();
  }

  /** 合并或丢弃之后调用；记录已不存在时什么也不做。 */
  async removeBranch(branchId: string): Promise<void> {
    await (await this.#branchRow(branchId))?.remove();
  }

  async #branchRow(branchId: string): Promise<AgentBranch | undefined> {
    const where = {
      combinator: 'and' as const,
      rules: [{ field: 'branchId' as const, operator: '=' as const, value: branchId }]
    };
    return (await firstValueFrom(AgentBranch.find({ where })))[0];
  }
}

/** 读模型快照、写智能体操作，绑定当前 RxDB 实例。 */
@Injectable()
export class AgentModelStore {
  readonly #rxdb = inject(RxDB);

  snapshot(modelDesignId: string): Promise<ModelSnapshot> {
    return loadModelSnapshot(modelDesignId);
  }

  write(modelDesignId: string, ops: readonly ModelOp[]): Promise<void> {
    return writeModelOps(this.#rxdb, modelDesignId, ops);
  }
}
