vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>
}));

vi.mock('@aiao/rxdb', () => ({
  __decorateClass: (_d: unknown[], target: unknown) => target,
  Entity: () => (target: unknown) => target,
  EntityBase: class EntityBase {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
    async save() {
      const id = this['id'] as string;
      const target = 'modelDesignId' in this ? mockState.sessions : mockState.messages;
      const idx = target.findIndex(e => e['id'] === id);
      if (idx >= 0) Object.assign(target[idx], this);
      else target.push(this);
    }
    async remove() {
      const id = this['id'] as string;
      if ('modelDesignId' in this) {
        const idx = mockState.sessions.findIndex(e => e['id'] === id);
        if (idx >= 0) mockState.sessions.splice(idx, 1);
        const toRemove = mockState.messages
          .map((m, i) => (m['chatSessionId'] === id ? i : -1))
          .filter(i => i >= 0)
          .reverse();
        toRemove.forEach(i => mockState.messages.splice(i, 1));
      }
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
    async save() {
      return this;
    }
    async remove() {
      /** */
    }
  },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] }
}));

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: (EntityClass: { name: string }) =>
    EntityClass.name === 'ChatSession' ? { value: () => mockState.sessions } : { value: () => mockState.messages }
}));

import { AiChatSessionService } from '../../services/ai-chat-session.service';

describe('AiChatSessionService', () => {
  let service: AiChatSessionService;

  beforeEach(() => {
    mockState.sessions.length = 0;
    mockState.messages.length = 0;
    TestBed.configureTestingModule({ providers: [AiChatSessionService] });
    service = TestBed.inject(AiChatSessionService);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('createSession', () => {
    it('should create session with modelDesignId and name', async () => {
      const session = await service.createSession('design-1', 'My Session');
      expect(session['id']).toBeTruthy();
      expect(mockState.sessions).toHaveLength(1);
      expect(mockState.sessions[0]['name']).toBe('My Session');
      expect(mockState.sessions[0]['modelDesignId']).toBe('design-1');
    });

    it('should set createdAt and lastUsedAt on creation', async () => {
      await service.createSession('design-1', 'Test');
      expect(mockState.sessions[0]['createdAt']).toBeInstanceOf(Date);
      expect(mockState.sessions[0]['lastUsedAt']).toBeInstanceOf(Date);
    });
  });

  describe('sessionsOf', () => {
    it('should filter by modelDesignId and sort by lastUsedAt desc', () => {
      mockState.sessions.push(
        { id: 's1', modelDesignId: 'design-1', name: 'Old', lastUsedAt: new Date('2024-01-01') },
        { id: 's2', modelDesignId: 'design-1', name: 'New', lastUsedAt: new Date('2024-06-01') },
        { id: 's3', modelDesignId: 'design-2', name: 'Other', lastUsedAt: new Date('2024-03-01') }
      );
      const sessions = service.sessionsOf('design-1')();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('s2');
      expect(sessions[1].id).toBe('s1');
    });

    it('should return same signal instance for same modelDesignId', () => {
      const s1 = service.sessionsOf('design-1');
      const s2 = service.sessionsOf('design-1');
      expect(s1).toBe(s2);
    });

    it('should map to ChatSessionItem with ISO lastUsedAt', () => {
      const date = new Date('2024-06-01T12:00:00.000Z');
      mockState.sessions.push({ id: 's1', modelDesignId: 'design-1', name: 'Test', lastUsedAt: date });
      const sessions = service.sessionsOf('design-1')();
      expect(sessions[0]).toEqual({ id: 's1', name: 'Test', lastUsedAt: date.toISOString() });
    });
  });

  describe('messagesOf', () => {
    it('should filter by chatSessionId and sort by createdAt asc', () => {
      mockState.messages.push(
        {
          id: 'm2',
          chatSessionId: 's1',
          role: 'assistant',
          content: 'reply',
          createdAt: new Date('2024-01-01T00:01:00Z')
        },
        { id: 'm1', chatSessionId: 's1', role: 'user', content: 'hi', createdAt: new Date('2024-01-01T00:00:00Z') },
        { id: 'm3', chatSessionId: 's2', role: 'user', content: 'other', createdAt: new Date('2024-01-01T00:02:00Z') }
      );
      const messages = service.messagesOf('s1')();
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('m1');
      expect(messages[1].id).toBe('m2');
    });

    it('should return same signal instance for same sessionId', () => {
      const m1 = service.messagesOf('s1');
      const m2 = service.messagesOf('s1');
      expect(m1).toBe(m2);
    });
  });

  describe('renameSession', () => {
    it('should update session name', async () => {
      const session = await service.createSession('d1', 'Old Name');
      await service.renameSession(session.id, 'New Name');
      expect(mockState.sessions[0]['name']).toBe('New Name');
    });

    it('should do nothing for unknown id', async () => {
      await expect(service.renameSession('unknown', 'Name')).resolves.toBeUndefined();
    });
  });

  describe('touchSession', () => {
    it('should update lastUsedAt to now', async () => {
      const session = await service.createSession('d1', 'Test');
      const oldDate = new Date('2024-01-01');
      (mockState.sessions[0] as Record<string, unknown>)['lastUsedAt'] = oldDate;
      await service.touchSession(session.id);
      expect((mockState.sessions[0]['lastUsedAt'] as Date).getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it('should do nothing for unknown id', async () => {
      await expect(service.touchSession('unknown')).resolves.toBeUndefined();
    });
  });

  describe('deleteSession', () => {
    it('should remove the session', async () => {
      const session = await service.createSession('d1', 'Test');
      await service.deleteSession(session.id);
      expect(mockState.sessions).toHaveLength(0);
    });

    it('should cascade delete associated messages', async () => {
      const session = await service.createSession('d1', 'Test');
      await service.addMessage(session.id, 'user', 'hi');
      await service.addMessage(session.id, 'assistant', 'hello');
      mockState.messages.push({
        id: 'm-other',
        chatSessionId: 'other-session',
        role: 'user',
        content: 'other',
        createdAt: new Date()
      });
      await service.deleteSession(session.id);
      expect(mockState.sessions).toHaveLength(0);
      expect(mockState.messages).toHaveLength(1);
      expect(mockState.messages[0]['chatSessionId']).toBe('other-session');
    });

    it('should do nothing for unknown id', async () => {
      await expect(service.deleteSession('unknown')).resolves.toBeUndefined();
    });
  });

  describe('addMessage', () => {
    it('should create message in session', async () => {
      const msg = await service.addMessage('s1', 'user', 'Hello AI');
      expect(msg['id']).toBeTruthy();
      expect(mockState.messages).toHaveLength(1);
      expect(mockState.messages[0]['chatSessionId']).toBe('s1');
      expect(mockState.messages[0]['role']).toBe('user');
      expect(mockState.messages[0]['content']).toBe('Hello AI');
    });

    it('should support assistant role', async () => {
      await service.addMessage('s1', 'assistant', 'I can help');
      expect(mockState.messages[0]['role']).toBe('assistant');
    });

    it('should set createdAt', async () => {
      await service.addMessage('s1', 'user', 'test');
      expect(mockState.messages[0]['createdAt']).toBeInstanceOf(Date);
    });
  });
});
