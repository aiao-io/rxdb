/**
 * @fileoverview 待推送清单（US-317）—— 真实 PGlite 本地 + 脚本化远端。
 *
 * @remarks
 * `versionManager.pushableHistories$` 与 `pushableCount$` 同一口径：一个事务一项、不在事务里的变更各一项。
 * 写入、撤销、重做、推送、部分被拒之后，清单长度都等于待推数；只存本地的实体不在清单里；
 * 上次打开时没推的修改在清单里（本次会话的 `histories$` 里没有它们）。
 */
import {
  Entity,
  ENTITY_STATIC_TYPES,
  EntityBase,
  type HistoryItem,
  PropertyType,
  RxDB,
  SyncType,
  type UUID
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { firstValueFrom, type Observable } from 'rxjs';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import {
  applied,
  newScript,
  rejected,
  type RemoteScript,
  SCRIPTED_REMOTE_ADAPTER,
  ScriptedRemote
} from './scripted-remote-fixture.js';

@Entity({ name: 'Us317Note', properties: [{ name: 'text', type: PropertyType.string }] })
class Us317Note extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare text: string;
}

/** 只存本地：没有推送资格，永远不进清单 */
@Entity({ name: 'Us317Draft', properties: [{ name: 'text', type: PropertyType.string }] })
class Us317Draft extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare text: string;
}

const opened: RxDB[] = [];

afterEach(async () => {
  const pending = opened.splice(0);
  for (const database of pending) await database.disconnectAll();
});

/** `store` 不传时落在 `idb://<dbName>`：同名再开一次就是同一个库 */
const createDatabase = async (script: RemoteScript, dbName: string, store?: 'memory'): Promise<RxDB> => {
  const database = new RxDB({
    dbName,
    context: { userId: 'us317' },
    entities: [Us317Note, Us317Draft],
    sync: { type: SyncType.Full, local: { adapter: 'pglite' }, remote: { adapter: SCRIPTED_REMOTE_ADAPTER } },
    syncOverrides: [{ entity: Us317Draft, sync: { type: SyncType.None, local: { adapter: 'pglite' } } }]
  });
  database.adapter('pglite', async db => new RxDBAdapterPGlite(db, store ? { store } : {}));
  database.adapter(SCRIPTED_REMOTE_ADAPTER, async db => new ScriptedRemote(db, script));
  database.use(rxDBPluginSync);
  database.use(rxDBPluginHistory);
  opened.push(database);
  await database.connect('pglite');
  await database.connect(SCRIPTED_REMOTE_ADAPTER);
  await database.versionManager.getCurrentBranch();
  return database;
};

const freshName = () => `us317-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** 订阅一条流，返回它最新的值；断言用 `vi.waitFor` 等它追上 */
const track = <T>(stream$: Observable<T>): { readonly latest: () => T | undefined } => {
  let latest: T | undefined;
  const subscription = stream$.subscribe(value => (latest = value));
  onTestFinished(() => subscription.unsubscribe());
  return { latest: () => latest };
};

/** 清单与待推数在同一刻相等，且等于期望值 */
const expectInStep = async (database: RxDB, expected: number) => {
  const list = track(database.versionManager.pushableHistories$);
  const count = track(database.versionManager.pushableCount$);
  await vi.waitFor(() => {
    expect(list.latest()).toHaveLength(expected);
    expect(count.latest()).toBe(expected);
  });
  return list.latest() as HistoryItem[];
};

const note = (text: string) => new Us317Note({ text });

describe('待推送清单（US-317）', () => {
  it('AC#1：两条独立写入与一次 saveMany 是三项，saveMany 那项带着事务的全部变更', async () => {
    const database = await createDatabase(newScript(), freshName(), 'memory');

    await note('a').save();
    await note('b').save();
    await database.entityManager.saveMany([note('c'), note('d')]);

    const list = await expectInStep(database, 3);
    const transaction = list.find(item => item.transactionId !== null);
    expect(transaction?.changes).toHaveLength(2);
  });

  it('AC#2 / AC#6：撤销离开清单、重做回来，推送成功后清空，数字一路跟清单相等', async () => {
    const database = await createDatabase(newScript(applied), freshName(), 'memory');
    await note('a').save();
    await note('b').save();
    await expectInStep(database, 2);

    await database.versionManager.history().undo();
    await expectInStep(database, 1);

    await database.versionManager.history().redo();
    await expectInStep(database, 2);

    await database.syncManager.push();
    await expectInStep(database, 0);
  });

  it('AC#2：切到别的分支，清单与待推数一起换成那个分支的；切回来又是原来的', async () => {
    const database = await createDatabase(newScript(), freshName(), 'memory');
    await note('a').save();
    await expectInStep(database, 1);

    await database.versionManager.createBranch('feature');
    await database.versionManager.switchBranch('feature');
    await expectInStep(database, 0);

    await database.versionManager.switchBranch('main');
    await expectInStep(database, 1);
  });

  it('AC#5：被远端拒绝的变更推送之后离开清单', async () => {
    const database = await createDatabase(newScript(rejected), freshName(), 'memory');
    await note('rejected').save();
    await expectInStep(database, 1);

    await database.syncManager.push();

    await expectInStep(database, 0);
  });

  it('AC#4：只存本地的实体不在清单里，计数也不含它', async () => {
    const database = await createDatabase(newScript(), freshName(), 'memory');

    await new Us317Draft({ text: 'local only' }).save();
    await note('pushable').save();

    const list = await expectInStep(database, 1);
    expect(list[0].changes.map(change => change.entity)).toEqual(['Us317Note']);
  });

  it('AC#3：上次打开时没推的修改，重新打开库之后在清单里（本次会话的 histories$ 里没有）', async () => {
    const dbName = freshName();
    const first = await createDatabase(newScript(), dbName);
    await note('offline').save();
    await expectInStep(first, 1);
    await first.disconnectAll();
    opened.splice(opened.indexOf(first), 1);

    const reopened = await createDatabase(newScript(), dbName);

    const list = await expectInStep(reopened, 1);
    expect(list[0].changes[0].entity).toBe('Us317Note');
    await expect(firstValueFrom(reopened.versionManager.history().histories$)).resolves.toEqual([]);
  });
});
