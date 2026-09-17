/**
 * @fileoverview T104 红测试：restore 的物化与 session 持久化保持字段加密 envelope；
 * 错误、摘要与 session 诊断里不出现加密字段的值（FR-043）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/restore-command.ts`（物化与 session 落库两段）。
 *
 * ## 加密列在这一层的形态，以及为什么它是**字符串**
 *
 * `commit-codec.ts` 的 fileoverview 已按适配器实际行为定案：加密列的落库形态是
 * `keyring.encrypt()` 返回的那个**信封字符串**（`sqlite-core.utils.ts` 直接把它写进列，
 * 读端对非字符串抛 `malformed_envelope`；pglite 的捕获触发器取的是已加密那一列）。
 * 于是本文件的种子里，`app.Secret.secret` 是一段字符串而不是 `Uint8Array`——
 * 后者正是那条「写得进、读得回、直到解密时才炸在别处」的静默损坏路径
 * （`patch` 是 json 列，字节数组进出一趟变成 `{"0":222,…}`）。
 *
 * ## 这一组防的是四件事
 *
 * 1. **物化时顺手 decode 了加密列。** `change-codec.ts` 对 `encrypted === true` 的列
 *    **一律跳过**编解码，而 restore 的重放链路是「读 ChangeSet → decode → 写条目 → encode」，
 *    中间任何一环把加密列当成普通 `binary` 处理，都会把信封字符串按 hex 解一遍。
 *    单看加密列分不出「codec 正确跳过了它」和「codec 压根没跑」——两种实现给出同一个观测。
 *    所以 {@link SceneSecret} 上另有一列 `thumbnail`：**同为 `binary`、只差 `encrypted`**。
 *    加密列必须原样、不加密列必须带 `$rxdbChangeValue` 信封，两条同时成立才排除得掉后者。
 * 2. **只守正向。** `inversePatch` 与 `patch` 同权——`commit-codec.ts` 的原话是
 *    「反向数据泄漏与正向数据泄漏是同一件事」。丢在反向列上的信封，会在下一次 discard
 *    重放时以同样的方式坏掉。
 * 3. **把内容抄进 session 行。** 会话要回答的只有「这次恢复来自哪个 commit、当时两个
 *    revision 是多少」（data-model.md §2.8）。多一列承载 patch 的诊断字段，就等于把加密
 *    内容复制进一张没人拿它当机密对待的表。本文件正面钉住会话行的**列集合**。
 * 4. **把内容抄进摘要或失败出口。** 失败路径最容易顺手 `JSON.stringify` 一份上下文进错误
 *    消息。注意判据取的是**密文**而不是明文：这一层拿不到明文，而密文出现在诊断里本身
 *    就是泄漏——`commit-codec.ts` 拒绝「先算指纹再校验」用的正是这个理由（留在指纹上的
 *    确证可以当确认预言机）。密文进不了诊断，明文自然也进不了。
 *
 * **本文件不碰的三件事**：at-rest 断言本身（那是 `commit()` 写路径，FR-038 / T041）、
 * 兼容性预检的判定规则（T101，这里只借它的失败出口验「诊断不带内容」）、
 * CAS 与会话终态（T102）。
 */

import { RXDB_CHANGE_CODEC_VERSION, RXDB_CHANGE_SCHEMA_VERSION, RXDB_CHANGE_VALUE_ENVELOPE_KEY } from '@aiao/rxdb';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint } from '../../commit/change-unit.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import {
  restoreWorkingTree,
  type WorkingTreeRestoreOptions,
  type WorkingTreeRestoreResult
} from '../../working-tree/restore-command.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeRestoreSession } from '../../working-tree/working-tree-restore-session.entity.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  SCENE_SECRET,
  seedCommit,
  stateRowOf,
  type WorkingTreeScene,
  type WorkingTreeSceneOptions
} from './fixtures/working-tree-scene.js';

/** 当前 HEAD 的 commit id。 */
const HEAD = 'commit-head';

/** 恢复目标；`HEAD~1` 那一个，承载加密列的就是它。 */
const OLDER = 'commit-older';

/**
 * 加密列 `secret` 的**正向**落库值：一段信封字符串。
 *
 * @remarks
 * 前缀刻意写成 `enc:v1:` 这种一眼可辨的形状，并且与 {@link SECRET_BEFORE} 只差尾巴——
 * 断言失败时能直接看出「串错了方向」还是「被解开了」。它同时是本文件唯一的**泄漏探针**：
 * 除了条目的 `patch` 两列，它不该出现在任何序列化产物里。
 */
const SECRET_AFTER = 'enc:v1:9f2c4ae1d0b7__CIPHERTEXT_AFTER__';

/** 加密列 `secret` 的**反向**落库值；与 {@link SECRET_AFTER} 同权。 */
const SECRET_BEFORE = 'enc:v1:1a8b30ff62c5__CIPHERTEXT_BEFORE__';

/** 不加密 binary 列 `thumbnail` 的字节，hex 形态；对照组。 */
const THUMB_AFTER_HEX = 'deadbeef';

/** 同上，反向。 */
const THUMB_BEFORE_HEX = 'cafebabe';

/** 把一段 hex 包成 change-codec 的 `$rxdbChangeValue` 信封——不加密 binary 列的落库形态。 */
const binaryEnvelope = (hex: string): Record<string, unknown> => ({
  [RXDB_CHANGE_VALUE_ENVELOPE_KEY]: {
    codecVersion: RXDB_CHANGE_CODEC_VERSION,
    schemaVersion: RXDB_CHANGE_SCHEMA_VERSION,
    type: 'binary',
    value: hex
  }
});

/**
 * 指向 `app.Secret` 的一个变更单元，三列齐备且**已是落库形态**。
 *
 * @remarks
 * 三列各自承担一条判据：`label` 是明文字符串（codec 本就不碰，验「没被顺手动过」），
 * `secret` 是加密列（必须原样），`thumbnail` 是同类型的不加密列（必须带信封）。
 * `buildCommitRows()` 收到的 patch 按约定就该是落库形态，所以这里不再 encode 一遍——
 * 再 encode 就是二次包裹，而二次包裹不报错。
 */
const secretUnitOf = (unitId: string): CommitChangeUnit => {
  const base: Omit<CommitChangeUnit, 'fingerprint'> = {
    unitId,
    transactionId: null,
    namespace: SCENE_SECRET.namespace,
    entity: SCENE_SECRET.name,
    entityId: 'secret-1',
    operation: 'update',
    patch: { label: '标题', secret: SECRET_AFTER, thumbnail: binaryEnvelope(THUMB_AFTER_HEX) },
    inversePatch: { label: '旧标题', secret: SECRET_BEFORE, thumbnail: binaryEnvelope(THUMB_BEFORE_HEX) },
    baseFingerprint: 'fp-base',
    origin: 'local'
  };
  return { ...base, fingerprint: computeChangeUnitFingerprint(base) };
};

/**
 * 两节点历史，`OLDER` 那一个带加密列。
 *
 * @remarks
 * `HEAD` 留成默认的 `app.Note` 单元：恢复目标之外的节点长什么样与本组无关，
 * 保持默认能顺带确认物化只捡了目标那一条。
 */
const sceneWithSecret = (options: WorkingTreeSceneOptions = {}): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 2, ...options });
  seedCommit(scene, OLDER, [], [secretUnitOf(`${OLDER}-secret`)]);
  seedCommit(scene, HEAD, [OLDER]);
  return scene;
};

/** 与场景初值对得上的凭据。 */
const credentialsOf = (
  scene: WorkingTreeScene,
  overrides: Partial<WorkingTreeRestoreOptions> = {}
): WorkingTreeRestoreOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

/** 恢复到 {@link OLDER}。 */
const restoreOlder = (scene: WorkingTreeScene): Promise<WorkingTreeRestoreResult> =>
  restoreWorkingTree(scene.probe.executor, scene.context, { commitId: OLDER }, credentialsOf(scene));

/** 取成功出口。 */
const expectOk = (result: WorkingTreeRestoreResult): Extract<WorkingTreeRestoreResult, { ok: true }> => {
  if (!result.ok) throw new Error(`期望这次恢复成功，实际拿到：${JSON.stringify(result)}`);
  return result;
};

/** 取恢复出来的那条 `app.Secret` 条目。 */
const secretEntryOf = (scene: WorkingTreeScene): WorkingTreeEntry => {
  const found = entryRowsOf(scene).find(entry => entry.entity === SCENE_SECRET.name);
  if (!found) throw new Error(`工作树里没有 ${SCENE_SECRET.namespace}.${SCENE_SECRET.name} 条目`);
  return found;
};

/** 取历史里承载加密列的那一行 ChangeSet。 */
const secretChangeSetOf = (scene: WorkingTreeScene): CommitChangeSet => {
  const found = (scene.probe.rowsOf(CommitChangeSet) as CommitChangeSet[]).find(
    row => row.entity === SCENE_SECRET.name
  );
  if (!found) throw new Error(`历史里没有 ${SCENE_SECRET.namespace}.${SCENE_SECRET.name} 的变更集行`);
  return found;
};

/**
 * 把任意东西摊成一个可搜索的字符串，用来找泄漏。
 *
 * @remarks
 * 不用 `JSON.stringify`：`Error` 的 `message` / `stack` 都是不可枚举的，JSON 化后是 `{}`，
 * 于是「错误里带了密文」这条永远测不出来。这里显式把 `Error` 摊平，其余走 JSON 并用
 * replacer 接住 `bigint`（JSON 化 `bigint` 会抛，而抛出去会被误读成用例本身的缺陷）。
 */
const flatten = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}|${value.message}|${value.stack ?? ''}|${flatten(value.cause)}`;
  return JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item)) ?? '';
};

/** 两个密文探针；只要有一个露在不该露的地方就算泄漏。 */
const CIPHERTEXTS = [SECRET_AFTER, SECRET_BEFORE] as const;

/** 摊平后找密文；返回命中的那些探针，空数组即干净。 */
const leaksIn = (value: unknown): string[] => {
  const text = flatten(value);
  return CIPHERTEXTS.filter(probe => text.includes(probe));
};

describe('物化保持加密 envelope（FR-043 前半）', () => {
  it('加密列原样穿过物化，不被 codec 碰', async () => {
    const scene = sceneWithSecret();

    await restoreOlder(scene);
    const patch = secretEntryOf(scene).patch ?? {};

    // 信封字符串被当成普通 binary 解一遍的话，这里会是一段 Uint8Array 或一次 hexToBytes 抛错；
    // 被 JSON 往返整形过的话会是 `{"0":…}`。两种都不是字符串，所以类型与值一起钉。
    expect({ type: typeof patch['secret'], value: patch['secret'] }).toEqual({
      type: 'string',
      value: SECRET_AFTER
    });
  });

  it('同一行里不加密的 binary 列**带**信封', async () => {
    const scene = sceneWithSecret();

    await restoreOlder(scene);
    const patch = secretEntryOf(scene).patch ?? {};

    // 这条是上一条的反面。只看加密列的话，「codec 正确跳过了加密列」与「codec 整个没跑」
    // 给出完全相同的观测；`thumbnail` 与 `secret` 同为 binary、只差 `encrypted`，
    // 它必须带信封，才说明 codec 确实跑了而且是按 `encrypted` 分的流。
    expect(patch['thumbnail']).toEqual(binaryEnvelope(THUMB_AFTER_HEX));
  });

  it('明文列照常穿过，没被顺手动过', async () => {
    const scene = sceneWithSecret();

    await restoreOlder(scene);

    expect((secretEntryOf(scene).patch ?? {})['label']).toBe('标题');
  });

  it('inversePatch 与 patch 同权', async () => {
    const scene = sceneWithSecret();

    await restoreOlder(scene);
    const inverse = secretEntryOf(scene).inversePatch ?? {};

    // 「反向数据泄漏与正向数据泄漏是同一件事」（commit-codec.ts）。只守正向的实现
    // 会在下一次 discard 重放时以同样的方式坏掉，而那条路径没有第二个守卫。
    expect({ secret: inverse['secret'], thumbnail: inverse['thumbnail'], label: inverse['label'] }).toEqual({
      secret: SECRET_BEFORE,
      thumbnail: binaryEnvelope(THUMB_BEFORE_HEX),
      label: '旧标题'
    });
  });

  it('物化出来的 patch 与历史行等值但不共享引用', async () => {
    const scene = sceneWithSecret();
    const historic = secretChangeSetOf(scene);

    await restoreOlder(scene);
    const entry = secretEntryOf(scene);

    // 等值是内容判据。不共享引用是另一条、而且更要紧：条目在 commit() 之后会被清理，
    // 与历史行共享同一个对象的话，清理会顺手改掉已经不可变的历史（data-model.md §2.4）——
    // 而 `structuredClone` 与「直接赋引用」在等值断言下看起来一模一样。
    expect({
      patchEqual: entry.patch,
      inverseEqual: entry.inversePatch,
      sharesPatch: entry.patch === historic.patch,
      sharesInverse: entry.inversePatch === historic.inversePatch
    }).toEqual({
      patchEqual: historic.patch,
      inverseEqual: historic.inversePatch,
      sharesPatch: false,
      sharesInverse: false
    });
  });
});

describe('session 行不承载内容（FR-043 后半）', () => {
  it('会话行的列集合里没有任何承载 patch 的列', async () => {
    const scene = sceneWithSecret();

    await restoreOlder(scene);
    const [session] = scene.probe.rowsOf(WorkingTreeRestoreSession) as WorkingTreeRestoreSession[];

    // 钉**整个列集合**而不是逐列 `not.toHaveProperty`：后者只拦得住我今天想得到的名字，
    // 而真正的风险是明天有人加一列 `diagnostics` / `preview` / `restoredPatch`。
    // 会话要回答的只有「来自哪个 commit、当时两个 revision 是多少」（data-model.md §2.8）。
    expect(Object.keys(session).sort()).toEqual(
      [
        'activeKey',
        'branchId',
        'createdAt',
        'expectedHeadRevision',
        'expectedWorkingTreeRevision',
        'id',
        'status',
        'targetCommitId',
        'updatedAt'
      ].sort()
    );
  });

  it('会话行整体序列化后不含密文', async () => {
    const scene = sceneWithSecret();

    await restoreOlder(scene);

    expect(leaksIn(scene.probe.rowsOf(WorkingTreeRestoreSession))).toEqual([]);
  });
});

describe('摘要与失败出口都不含密文（FR-043 后半）', () => {
  it('成功摘要不含密文', async () => {
    const scene = sceneWithSecret();

    const result = expectOk(await restoreOlder(scene));

    expect(leaksIn(result)).toEqual([]);
  });

  it('成功摘要的字段集合是固定的三项加判别位', async () => {
    const scene = sceneWithSecret();

    const result = expectOk(await restoreOlder(scene));

    // 与上一条互补：上一条拦的是「今天就把密文写进了摘要」，这一条拦的是
    // 「明天往摘要上挂一个承载内容的字段」。摘要是最容易被顺手加料的那个出口——
    // 调用方想看看恢复了什么，而「看看」在实现上就是把 patch 抄一份出来。
    expect(Object.keys(result).sort()).toEqual(['ok', 'restoredCount', 'sessionId', 'workingTreeRevision'].sort());
  });

  it('CAS 失败的返回值不含密文', async () => {
    const scene = sceneWithSecret({ rowsAffected: 0 });

    const result = await restoreOlder(scene);

    // 失败路径最容易顺手把上下文 `JSON.stringify` 进错误消息，而这一条路径上
    // 手里正好握着刚读出来的 ChangeSet。
    expect({ ok: result.ok, leaks: leaksIn(result) }).toEqual({ ok: false, leaks: [] });
  });

  it('dirty 拒绝的返回值不含密文', async () => {
    const scene = sceneWithSecret();
    scene.addEntry({
      namespace: SCENE_SECRET.namespace,
      entity: SCENE_SECRET.name,
      entityId: 'secret-1',
      patch: { secret: SECRET_AFTER },
      inversePatch: { secret: SECRET_BEFORE }
    });
    stateRowOf(scene).entryCount = entryRowsOf(scene).length;

    const result = await restoreWorkingTree(
      scene.probe.executor,
      scene.context,
      { commitId: OLDER },
      credentialsOf(scene)
    );

    // 挡路的那条条目自己就带加密列：dirty 报告若为了「告诉用户是哪些改动挡了路」
    // 而把条目摊进去，泄漏就发生在一条看起来最无害的诊断上。
    expect({ ok: result.ok, leaks: leaksIn(result) }).toEqual({ ok: false, leaks: [] });
  });

  it('恢复被拒之后，工作树里那条既有条目的加密列没被动过', async () => {
    const scene = sceneWithSecret();
    scene.addEntry({
      namespace: SCENE_SECRET.namespace,
      entity: SCENE_SECRET.name,
      entityId: 'secret-1',
      patch: { secret: SECRET_AFTER },
      inversePatch: { secret: SECRET_BEFORE }
    });
    stateRowOf(scene).entryCount = entryRowsOf(scene).length;

    await restoreWorkingTree(scene.probe.executor, scene.context, { commitId: OLDER }, credentialsOf(scene));

    // 「拒绝」不该是「读一遍再放回去」——读写一个来回正是信封被解开的时机。
    expect(secretEntryOf(scene).patch?.['secret']).toBe(SECRET_AFTER);
  });

  it('抛出来的异常也不含密文', async () => {
    const scene = sceneWithSecret();
    // patch 列里塞一个数组：`assertPatchShape` 对非普通对象抛 TypeError，
    // 这是恢复链路上唯一一条**抛**而不是返回失败出口的路。
    secretChangeSetOf(scene).patch = [SECRET_AFTER] as unknown as Record<string, unknown>;

    const thrown = await restoreOlder(scene).then(
      () => null,
      (error: unknown) => error
    );

    // 抛错路径不经过任何「构造失败出口」的代码，于是也没人替它想过脱敏；
    // 而它手里的那份坏数据正好就是密文本身。
    expect(thrown === null ? [] : leaksIn(thrown)).toEqual([]);
  });
});

describe('类型面：摘要与会话都没有承载内容的字段', () => {
  it('会话实体上不存在 patch / inversePatch 两列', () => {
    expectTypeOf<WorkingTreeRestoreSession>().not.toHaveProperty('patch');
    expectTypeOf<WorkingTreeRestoreSession>().not.toHaveProperty('inversePatch');
  });

  it('条目实体才是承载内容的那个', () => {
    // 正面确认「内容只落在条目上」不是因为 patch 这个概念在本特性里不存在——
    // 它存在，只是只该存在于一个地方。
    expectTypeOf<WorkingTreeEntry['patch']>().toEqualTypeOf<Record<string, unknown> | null>();
  });
});
