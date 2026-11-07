import {
  ChatMessage,
  ChatSession,
  DesignEntity,
  DesignIndex,
  DesignProperty,
  DesignRelation,
  ModelDesign
} from '../../models/index.js';
import { type RxDB, type RuleGroup } from '@aiao/rxdb';
import { createTestDatabase } from './sqlite-database';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const EMPTY_RULES = { combinator: 'and', rules: [] } as RuleGroup<ModelDesign>;

describe('RxDB query lifecycle (real SQLite)', () => {
  let rxdb: RxDB;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const testDatabase = await createTestDatabase([ModelDesign, DesignEntity, DesignProperty, DesignRelation, DesignIndex, ChatSession, ChatMessage]);
    rxdb = testDatabase.database;
    dispose = testDatabase.dispose;
  });

  afterAll(async () => {
    await dispose();
  });

  it('keeps emitting after the final subscriber unsubscribes and the same observable is subscribed again', async () => {
    const repository = rxdb.entityManager.getRepository(ModelDesign);
    const query = repository.findAll({ where: EMPTY_RULES });
    const firstSnapshots: string[][] = [];
    const firstSubscription = query.subscribe(designs => firstSnapshots.push(designs.map(design => design.id)));

    await vi.waitFor(() => expect(firstSnapshots).toHaveLength(1));
    firstSubscription.unsubscribe();

    const secondSnapshots: string[][] = [];
    const secondSubscription = query.subscribe(designs => secondSnapshots.push(designs.map(design => design.id)));
    const design = new ModelDesign({ name: 'resubscribe-probe', namespace: 'public' });

    try {
      await design.save();
      await vi.waitFor(() => expect(secondSnapshots.at(-1)).toContain(design.id));
    } finally {
      secondSubscription.unsubscribe();
    }
  });
});
