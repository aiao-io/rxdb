import { describe, expect, it } from 'vitest';
import { EntityBase } from '../entity/entity-base.js';
import { Entity } from '../entity/entity.decorator.js';
import type { EntityType } from '../entity/entity.interface.js';
import { PropertyType, SyncType } from '../entity/metadata-options.interface.js';
import { Repository } from '../repository/Repository.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

function createFixture() {
  @Entity({ name: 'ReviewRepositoryTeardown', properties: [{ name: 'title', type: PropertyType.string }] })
  class ReviewEntity extends EntityBase {
    title!: string;
  }

  const failure = new Error('review repository dispose failed');
  class ReviewRepository<T extends EntityType> extends Repository<T> {
    failDestroy = false;
    override destroy(): void {
      super.destroy();
      if (this.failDestroy) throw failure;
    }
  }

  const createDatabase = () => {
    const db = new RxDB({
      dbName: `review-repository-teardown-${crypto.randomUUID()}`,
      entities: [ReviewEntity],
      multiInstance: false,
      sync: { type: SyncType.None, local: { adapter: 'local' } }
    });
    db.repository('Repository', { class: ReviewRepository });
    const adapter = createMockAdapter(db);
    db.adapter('local', () => adapter);
    return { db, adapter };
  };

  const first = createDatabase();
  return { ...first, createDatabase, ReviewEntity, failure };
}

describe('评审：仓储销毁异常不能中断 RxDB 全部拆卸', () => {
  it('仓储抛错后仍应断开已打开的 adapter', async () => {
    const fixture = createFixture();
    const { db, adapter, ReviewEntity, failure } = fixture;
    await db.connect('local');
    const repository = db.entityManager.getRepository(ReviewEntity);
    const failing = repository as typeof repository & { failDestroy: boolean };
    failing.failDestroy = true;
    try {
      await expect(db.destroy()).rejects.toBe(failure);
      expect(adapter.disconnect).toHaveBeenCalledOnce();
    } finally {
      failing.failDestroy = false;
      db.entityManager.destroy();
      await adapter.disconnect();
      await db.destroy();
    }
  });

  it('仓储抛错后应解绑实体类，不影响下一数据库实例', async () => {
    const fixture = createFixture();
    const { db, adapter, ReviewEntity, failure } = fixture;
    await db.connect('local');
    const repository = db.entityManager.getRepository(ReviewEntity);
    const failing = repository as typeof repository & { failDestroy: boolean };
    failing.failDestroy = true;
    const next = fixture.createDatabase();
    try {
      await expect(db.destroy()).rejects.toBe(failure);
      await next.db.connect('local');
      expect(() => new ReviewEntity({ title: 'next generation' })).not.toThrow();
    } finally {
      failing.failDestroy = false;
      db.entityManager.destroy();
      await adapter.disconnect();
      await next.db.destroy();
      await db.destroy();
    }
  });

  it('对照：正常销毁会断开 adapter，并解绑共享实体类', async () => {
    const fixture = createFixture();
    await fixture.db.connect('local');
    fixture.db.entityManager.getRepository(fixture.ReviewEntity);
    await fixture.db.destroy();
    expect(fixture.adapter.disconnect).toHaveBeenCalledOnce();
    const next = fixture.createDatabase();
    try {
      await next.db.connect('local');
      expect(() => new fixture.ReviewEntity({ title: 'clean generation' })).not.toThrow();
    } finally {
      await next.db.destroy();
    }
  });
});
