import { describe, expect, it } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import { TransactionBeginEvent } from '../rxdb-events.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import type { RxDBOptions } from '../rxdb.interface.js';
import {
  ENTITY_MANAGER,
  ENTITY_TYPE,
  METADATA,
  PROXY,
  STATUS,
  isLocalAdapter,
  isTransactionEvent
} from '../rxdb.private.js';

describe('rxdb.private helpers', () => {
  it('isLocalAdapter should detect local', () => {
    const opts: RxDBOptions = {
      dbName: 'private-helpers',
      entities: [],
      sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
    };
    expect(isLocalAdapter('sqlite', opts)).toBe(true);
    expect(isLocalAdapter('other', opts)).toBe(false);
  });

  it('isTransactionEvent should detect only tx events', () => {
    expect(isTransactionEvent(new TransactionBeginEvent())).toBe(true);
  });

  it('should share runtime symbols across package entrypoints', () => {
    expect(PROXY).toBe(Symbol.for('@aiao/rxdb/ɵProxy'));
    expect(METADATA).toBe(Symbol.for('@aiao/rxdb/ɵMetadata'));
    expect(STATUS).toBe(Symbol.for('@aiao/rxdb/ɵStatus'));
    expect(ENTITY_MANAGER).toBe(Symbol.for('@aiao/rxdb/ɵEntityManager'));
    expect(ENTITY_TYPE).toBe(Symbol.for('@aiao/rxdb/ɵEntityType'));
  });

  it('should read metadata written by another package entrypoint', () => {
    class ForeignEntity {}
    const metadata = { name: 'ForeignEntity' } as EntityMetadata;

    Reflect.defineProperty(ForeignEntity, Symbol.for('@aiao/rxdb/ɵMetadata'), { value: metadata });

    expect(getEntityMetadata(ForeignEntity as never)).toBe(metadata);
  });
});
