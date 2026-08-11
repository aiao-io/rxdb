import { RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, IdCard, User } from '@aiao/rxdb-test/shop';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';

const delay = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

describe('PGlite relation query coverage', () => {
  let rxdb: RxDB;

  const createUserWithIdCard = async (
    name: string,
    code: string,
    options?: { age?: number }
  ): Promise<{ user: User; idCard: IdCard }> => {
    const user = new User();
    user.name = name;
    if (options?.age !== undefined) {
      user.age = options.age;
    }

    const idCard = new IdCard();
    idCard.code = code;
    idCard.owner$.set(user);
    user.idCard$.set(idCard);

    await user.save();
    return { user, idCard };
  };

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `relation-query-pglite-${Date.now()}`,
      context: { userId: 'relation-test-user' },
      entities: [...ENTITIES],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  it('finds users by related IdCard code', async () => {
    const { user } = await createUserWithIdCard('finder', 'RC1-FIND');

    await delay();

    const result = await firstValueFrom(
      User.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'idCard.code',
              operator: '=',
              value: 'RC1-FIND'
            }
          ]
        }
      })
    );

    expect(result.some(item => item.id === user.id)).toBe(true);
  });

  it('reflects IdCard code updates in subsequent queries', async () => {
    const { user, idCard } = await createUserWithIdCard('updater', 'RC2-OLD');

    await delay();

    const beforeChange = await firstValueFrom(
      User.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'idCard.code',
              operator: '=',
              value: 'RC2-OLD'
            }
          ]
        }
      })
    );
    expect(beforeChange.some(item => item.id === user.id)).toBe(true);

    idCard.code = 'RC2-NEW';
    await idCard.save();
    await delay();

    const afterChange = await firstValueFrom(
      User.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'idCard.code',
              operator: '=',
              value: 'RC2-NEW'
            }
          ]
        }
      })
    );
    expect(afterChange.some(item => item.id === user.id)).toBe(true);

    const oldCodeResult = await firstValueFrom(
      User.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'idCard.code',
              operator: '=',
              value: 'RC2-OLD'
            }
          ]
        }
      })
    );
    expect(oldCodeResult.length).toBe(0);
  });

  it('updates count results when IdCard data changes', async () => {
    const { idCard } = await createUserWithIdCard('counter', 'RC3-COUNT');

    await delay();

    const initialCount = await firstValueFrom(
      User.count({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'idCard.code',
              operator: '=',
              value: 'RC3-COUNT'
            }
          ]
        }
      })
    );
    expect(initialCount).toBe(1);

    idCard.code = 'RC3-OTHER';
    await idCard.save();
    await delay();

    const updatedCount = await firstValueFrom(
      User.count({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'idCard.code',
              operator: '=',
              value: 'RC3-COUNT'
            }
          ]
        }
      })
    );
    expect(updatedCount).toBe(0);
  });

  it('supports reverse lookups via IdCard owner fields', async () => {
    const { user, idCard } = await createUserWithIdCard('reverse', 'RC4-REV', { age: 26 });

    await delay();

    const initial = await firstValueFrom(
      IdCard.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'code',
              operator: '=',
              value: 'RC4-REV'
            },
            {
              field: 'owner.age',
              operator: '=',
              value: 26
            }
          ]
        }
      })
    );
    expect(initial.some(item => item.id === idCard.id)).toBe(true);

    user.age = 30;
    await user.save();
    await delay();

    const afterAgeChange = await firstValueFrom(
      IdCard.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'code',
              operator: '=',
              value: 'RC4-REV'
            },
            {
              field: 'owner.age',
              operator: '=',
              value: 26
            }
          ]
        }
      })
    );
    expect(afterAgeChange.length).toBe(0);
  });
});
