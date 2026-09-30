/**
 * @fileoverview 捕获热路径的**查询条数**：一批写只读一次令牌、一次状态行，每条变更只查一次既有条目。
 *
 * @remarks
 * `captureChanges()` 是 `save()` / `saveMany()` / `switchBranch` / `mergeChanges` 四个挂载点
 * 最终都落到的那一段，也是整个插件里唯一按**用户写入频率**跑的代码。它每多发一条查询，
 * 代价就乘上用户一次保存里的实体数——批量导入一次写 500 行，冗余查询是 500 的倍数。
 *
 * 这里钉的三件事都建立在**同一个事务**这个前提上（`@fileoverview` of `capture-runtime.ts`：
 * 本模块每个入口都收调用方的 executor，自己不开事务）：
 *
 * 1. **令牌每批读一次。** 令牌的两个字段来自两张表，逐变更重读一次就是每条变更 2 次查询。
 *    同事务里第二次读只可能读到与第一次相同的值——`captureCrudWrite()` 的 token 校验要拦的是
 *    「**另一个 realm** 在期间切过分支」，而那种切换要么在本事务开始前已经提交（第一次读就看得见），
 *    要么在本事务提交前落不了地（本事务正持着工作树行的写锁）。
 * 2. **既有条目每变更查一次。** `readEntry()` 与 `persistEntry()` 之间没有任何别的写，
 *    `persistEntry()` 再查一遍唯一索引只会拿回 `readEntry()` 刚拿到的同一行。
 * 3. **状态行每批读一次、写一次。** 中间态的 `workingTreeRevision` 在事务内无人可读，
 *    只有提交后的**终值**是可观测的——所以终值必须与逐条递增时逐字相同，这也是本文件第二组断言。
 *
 * 一条都不捕获时**一次查询都不发**：`untracked` 域整批被挡掉是常态（`untracked-domain.spec.ts`），
 * 那种批次不该为了「先把状态行读出来备用」付一次 IO。
 */

import { getEntityMetadata, RxDBBranch, uuid, type EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  captureChanges,
  createWorkingTreeCapturePort,
  type ChangeCaptureSource
} from '../../working-tree/capture-runtime.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import type { ActiveBranchToken, WorkingTreeEntryRow } from '../../working-tree/write-entry.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  SCENE_BRANCH_ID,
  SceneNote,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

const NOTE = getEntityMetadata(SceneNote);

/** 场景初值就是 0/0；令牌照着它造，捕获才不会被判过期。 */
const TOKEN: ActiveBranchToken = { branchId: SCENE_BRANCH_ID, activationRevision: 0 };

/** 本次调用在某张表上发过的 `find()` / `count()` 次数。 */
const findCountOf = (scene: WorkingTreeScene, EntityClass: EntityType): number => {
  const { name } = getEntityMetadata(EntityClass);
  return scene.probe.finds.filter(call => call.entity === name).length;
};

/** 一条普通编辑变更；同一个 `entityId` 会被折进同一条条目。 */
const changeOf = (entityId: string): ChangeCaptureSource => ({
  id: null,
  type: 'UPDATE',
  transactionId: 'tx-1',
  namespace: NOTE.namespace,
  entity: NOTE.name,
  entityId,
  patch: { title: '改后' },
  inversePatch: { title: '改前' }
});

/** 走真实批捕获入口；`shouldCapture` 默认全收。 */
const captureBatch = (
  scene: WorkingTreeScene,
  entityIds: readonly string[],
  shouldCapture: () => boolean = () => true
): Promise<number> =>
  captureChanges(
    scene.probe.executor,
    { entityManager: scene.database.entityManager },
    {
      token: TOKEN,
      unitId: uuid(),
      origin: 'local',
      changes: entityIds.map(changeOf),
      shouldCapture
    }
  );

describe('捕获热路径每批只发必要的那几条查询', () => {
  it('三条变更只读一次 active 分支令牌', async () => {
    const scene = createWorkingTreeScene({});

    await captureBatch(scene, ['note-1', 'note-2', 'note-3']);

    expect(findCountOf(scene, RxDBBranch)).toBe(1);
    expect(findCountOf(scene, WorkingTreeActivationState)).toBe(1);
  });

  it('三条变更只读一次工作树状态行', async () => {
    const scene = createWorkingTreeScene({});

    await captureBatch(scene, ['note-1', 'note-2', 'note-3']);

    expect(findCountOf(scene, WorkingTreeState)).toBe(1);
  });

  it('每条变更只查一次既有条目，不再由 persistEntry 重查一遍', async () => {
    const scene = createWorkingTreeScene({});

    await captureBatch(scene, ['note-1', 'note-2', 'note-3']);

    expect(findCountOf(scene, WorkingTreeEntry)).toBe(3);
  });

  it('一条都不捕获时一次查询都不发', async () => {
    const scene = createWorkingTreeScene({});

    const captured = await captureBatch(scene, ['note-1', 'note-2'], () => false);

    expect(captured).toBe(0);
    expect(scene.probe.finds).toHaveLength(0);
  });
});

describe('少发查询没有改变落库结果', () => {
  it('三条不同实体落成三条条目，revision 与 entryCount 各 +3', async () => {
    const scene = createWorkingTreeScene({});

    const captured = await captureBatch(scene, ['note-1', 'note-2', 'note-3']);

    expect(captured).toBe(3);
    expect(entryRowsOf(scene)).toHaveLength(3);
    const state = stateRowOf(scene);
    // 逐条递增时的终值是 0+3；批级累加必须给出同一个数，否则另一个 Tab 手里的
    // `expectedWorkingTreeRevision` 会对着一个从未存在过的值做仲裁。
    expect(state.workingTreeRevision).toBe(3);
    expect(state.entryCount).toBe(3);
  });

  it('同一实体连写三次折成一条，revision +3 而 entryCount 只 +1', async () => {
    const scene = createWorkingTreeScene({});

    await captureBatch(scene, ['note-1', 'note-1', 'note-1']);

    expect(entryRowsOf(scene)).toHaveLength(1);
    const state = stateRowOf(scene);
    expect(state.workingTreeRevision).toBe(3);
    expect(state.entryCount).toBe(1);
  });
});

describe('端口不猜既有行', () => {
  it('没先 readEntry 就 persistEntry 时当场抛，错误里带身份', async () => {
    const scene = createWorkingTreeScene({});
    const key = { namespace: NOTE.namespace, entity: NOTE.name, entityId: 'note-1' };
    const port = createWorkingTreeCapturePort(
      scene.probe.executor,
      { entityManager: scene.database.entityManager },
      TOKEN,
      key
    );
    const row: WorkingTreeEntryRow = {
      ...key,
      operation: 'update',
      patch: { title: '改后' },
      inversePatch: { title: '改前' },
      fingerprint: '00000001',
      origin: 'local',
      unitId: 'unit-1',
      transactionId: null,
      sourceChangeId: null
    };

    await expect(port.persistEntry(row, 1)).rejects.toThrow(`${NOTE.namespace}.${NOTE.name}#note-1`);
    expect(entryRowsOf(scene)).toHaveLength(0);
  });
});
