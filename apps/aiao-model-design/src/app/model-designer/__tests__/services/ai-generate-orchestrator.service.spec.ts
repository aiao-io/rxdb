vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aiao/rxdb', () => ({
  __decorateClass: (_d: unknown[], target: unknown) => target,
  RxDB: class {},
  UUID: String,
  Entity: () => (target: unknown) => target,
  EntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
  },
  PropertyType: { string: 'string', date: 'date', enum: 'enum' },
  RelationKind: { ONE_TO_MANY: 'ONE_TO_MANY', MANY_TO_ONE: 'MANY_TO_ONE' },
  OnDeleteAction: { CASCADE: 'CASCADE' },
  ENTITY_BASE_METADATA_OPTIONS: { properties: [], computedProperties: [], relations: [] },
  TreeEntity: () => (target: unknown) => target,
  TreeAdjacencyListEntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
  },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] }
}));

import { RxDB } from '@aiao/rxdb';
import { AI_API_ADAPTER, type AiApiAdapter } from '../../interfaces/designer.interface';
import { AiChatApplyService } from '../../services/ai-chat-apply.service';
import { AiChatSessionService } from '../../services/ai-chat-session.service';
import { AiGenerateOrchestratorService } from '../../services/ai-generate-orchestrator.service';
import { AiOperationGuardService } from '../../services/ai-operation-guard.service';
import { DesignEntityService } from '../../services/design-entity.service';
import { DesignIndexService } from '../../services/design-index.service';
import { DesignPropertyService } from '../../services/design-property.service';
import { DesignRelationService } from '../../services/design-relation.service';
import { ModelDesignService } from '../../services/model-design.service';
import type { ChatChangeProposal } from '../../types/ai-schemas';

function createProposal(overrides: Partial<ChatChangeProposal> = {}): ChatChangeProposal {
  return {
    description: 'Add Tag',
    changes: [{ action: 'addEntity', entityId: 'new-e', entityName: 'Tag', details: {} }],
    ...overrides
  };
}

type GenerateCallback = NonNullable<Parameters<AiApiAdapter['generate']>[2]>;

function createHarness(options?: {
  applyImpl?: () => Promise<void>;
  generateImpl?: (callbacks?: GenerateCallback) => Promise<void>;
}) {
  const applyProposal = vi.fn(options?.applyImpl ?? (async () => undefined));
  const generate = vi.fn(
    async (
      _prompt: string,
      _existingModel?: { entityNames: string[]; entities?: unknown[] },
      callbacks?: GenerateCallback
    ) => options?.generateImpl?.(callbacks)
  );
  const createBranch = vi.fn().mockResolvedValue({ id: 'ai-test' });
  const switchBranch = vi.fn().mockResolvedValue(undefined);
  const removeBranch = vi.fn().mockResolvedValue(undefined);
  const activeDesign = signal<{ id: string } | null>({ id: 'design-1' });
  const chatSession = {
    sessionsOf: vi.fn().mockReturnValue(signal([])),
    messagesOf: vi.fn().mockReturnValue(signal([])),
    createSession: vi.fn(),
    addMessage: vi.fn().mockResolvedValue(undefined),
    touchSession: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    renameSession: vi.fn().mockResolvedValue(undefined)
  };

  TestBed.configureTestingModule({
    providers: [
      AiGenerateOrchestratorService,
      AiOperationGuardService,
      { provide: AiChatApplyService, useValue: { applyProposal } },
      { provide: AiChatSessionService, useValue: chatSession },
      { provide: ModelDesignService, useValue: { activeDesign } },
      { provide: DesignEntityService, useValue: { entities: signal([]) } },
      { provide: DesignPropertyService, useValue: { propertiesOf: () => signal([]) } },
      { provide: DesignRelationService, useValue: { relationsOf: () => signal([]) } },
      { provide: DesignIndexService, useValue: { indexesOf: () => signal([]) } },
      {
        provide: RxDB,
        useValue: {
          entityManager: {},
          versionManager: {
            createBranch,
            switchBranch,
            removeBranch,
            mergeBranch: vi.fn().mockResolvedValue({ merged: 0 }),
            getCurrentBranch: vi.fn().mockResolvedValue({ id: 'main', parentId: null })
          }
        }
      },
      { provide: AI_API_ADAPTER, useValue: { generate, chat: vi.fn(), abort: vi.fn() } }
    ]
  });

  return {
    service: TestBed.inject(AiGenerateOrchestratorService),
    applyProposal,
    createBranch,
    switchBranch,
    removeBranch
  };
}

describe('AiGenerateOrchestratorService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('confirmProposal', () => {
    it('should apply active proposal then clear it', async () => {
      const { service, applyProposal } = createHarness();
      const proposal = createProposal();
      service.activeProposal.set(proposal);

      await service.confirmProposal();

      expect(applyProposal).toHaveBeenCalledOnce();
      expect(applyProposal).toHaveBeenCalledWith(proposal);
      expect(service.activeProposal()).toBeUndefined();
    });

    it('should not apply when there is no active proposal', async () => {
      const { service, applyProposal } = createHarness();

      await service.confirmProposal();

      expect(applyProposal).not.toHaveBeenCalled();
      expect(service.activeProposal()).toBeUndefined();
    });

    it('should keep proposal when apply fails', async () => {
      const { service, applyProposal } = createHarness({
        applyImpl: async () => {
          throw new Error('apply failed');
        }
      });
      const proposal = createProposal();
      service.activeProposal.set(proposal);

      await expect(service.confirmProposal()).rejects.toThrow('apply failed');
      expect(applyProposal).toHaveBeenCalledOnce();
      expect(service.activeProposal()).toEqual(proposal);
    });
  });

  describe('cancelProposal', () => {
    it('should clear proposal without applying', async () => {
      const { service, applyProposal } = createHarness();
      service.activeProposal.set(createProposal());

      service.cancelProposal();

      expect(applyProposal).not.toHaveBeenCalled();
      expect(service.activeProposal()).toBeUndefined();
    });
  });

  describe('generation branch lifecycle', () => {
    it('MUST discard an empty generation branch before returning to idle', async () => {
      const { service, createBranch, switchBranch, removeBranch } = createHarness({
        generateImpl: async callbacks => {
          await callbacks?.onComplete?.({ entities: [] });
        }
      });
      service.activeSessionId.set('session-1');

      await service.generate('Create nothing');

      expect(createBranch).toHaveBeenCalledOnce();
      expect(switchBranch).toHaveBeenLastCalledWith('main');
      expect(removeBranch).toHaveBeenCalledWith(expect.stringMatching(/^ai-/));
      expect(service.currentBranchId()).toBeNull();
      expect(service.operationState()).toBe('idle');
    });

    it('MUST discard an aborted generation branch before returning to idle', async () => {
      const { service, switchBranch, removeBranch } = createHarness({
        generateImpl: async callbacks => {
          await callbacks?.onError?.({ type: 'network', message: 'AbortError' });
        }
      });
      service.activeSessionId.set('session-1');

      await service.generate('Create users');

      expect(switchBranch).toHaveBeenLastCalledWith('main');
      expect(removeBranch).toHaveBeenCalledWith(expect.stringMatching(/^ai-/));
      expect(service.currentBranchId()).toBeNull();
      expect(service.operationState()).toBe('idle');
    });
  });
});
