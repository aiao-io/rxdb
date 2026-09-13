/**
 * @fileoverview T048 红测试：写入口语义矩阵（spec.md「写入口语义矩阵」、FR-046、conformance-suites.md §1.2）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/write-entry-matrix.ts` 里的一个纯判定：给定「谁在写、写哪张表、
 * 写了哪些列」，回答「这次写要不要落工作树单元、要不要递增 revision、还是干脆不许写」。
 * 四个挂载点（T058–T061）与六个适配器的 `rawQuery`（T064）都调它，**一份判定，多处调用**——
 * 与 5 步 bypass 判定同一个理由：同一张表在十处各解释一遍，十处就会慢慢解释成十个样子。
 *
 * 为什么这些断言值得写：
 *
 * 1. **这张表的键是「入口 × 目标类」，不是函数名。** 同一个 `mergeChanges` 在本地重载上落矩阵行 3、
 *    在远端重载上根本不写业务表；同一次 `save()` 写版本化实体落行 1、写 QueryCache 实体落行 8。
 *    判定要是写成 `if (callerIsPull())` 的形态，判据就成了「6 个适配器 × 4 个挂载点的调用图」，
 *    而那张图每次重构都在变。
 * 2. **入口枚举与矩阵行不是一一对应。** 行 4「只更新 `remoteId` / 同步水位 / 审计时间」不是一个入口，
 *    是**写了什么**：`pull()` 同一次往返里既写实体又推水位，它落行 3 还是行 4，取决于这一条语句碰了
 *    哪些列。所以入参里入口身份与列集都得有，缺一个就表达不了这张表。别把 11 个入口硬掰成 11 行。
 * 3. **「不捕获」与「拒绝」必须是两个结论。** 两者都「没产生单元」，于是很容易被实现成同一个
 *    `return false`。但行 6（分支物化）与行 9（raw 直写）要的行为相反：前者必须让这次写**照常发生**，
 *    后者必须让它**根本不发生**。合并成布尔之后两行里必有一行是错的，而且错的那行没有测试位置能发现。
 * 4. **`revisionBump` 与「有没有单元」同生同死**，所以三种结论都带这个字段，并由一条全组合用例断言
 *    二者等价。分开设置迟早会被设成不一致：多递增一次，下一次 `commit()` 的 CAS 会在**没有任何并发写**
 *    的情况下返回 `CommitConflict`；少递增一次，另一个 realm 手里的陈旧 revision 会被当成新鲜的。
 * 5. **`origin` 与「要不要进 changelog」是两个问题**，即使今天答案一一对应。FR-046 点名的失败形态是
 *    pull 写进来的实体被当成本地编辑再 push 回去（push echo）。两者合成一个字段之后，「`remote_sync`
 *    的单元要不要 push」就没有代码位置可改了，下一个人只能在调用点上补 `if`。
 * 6. **untracked 字段域是注入的，不是这里内建的。** spec.md 要求它与「版本化业务实体表」跟版本化域引用
 *    **同一份**清单、不得另建第二份（T056）。判定自带一份清单就是在建第二份，所以这里连查表都不做，
 *    只做子集比较——「第二份」在类型上无处可放。
 * 7. **无法确定的列集不是空集。** 解析不出被写列时按「不是 untracked 子集」处理（fail-closed）。反过来
 *    的读法会让任何一条判定不了的语句自动获得「纯元数据更新」豁免，而那正是绕过捕获最省事的写法。
 *    同理，只有 UPDATE 才可能是纯元数据写：INSERT 与 DELETE 本身就是净变化，列集里填什么都不改变这点。
 * 8. **能力位排在最前面，先于入口许可。** FR-046 要的是零行为差异：没启用提交能力的库上，raw 写、未知
 *    入口、`notifyExternalUpdate()` 都必须与没装这个特性时逐字节一致。把能力位放在入口许可之后判断，
 *    未启用的库会开始拒绝它一直允许的写法——升级即故障，而且故障点在完全没打算用这个功能的用户那里。
 * 9. **「每一行至少一条用例」是机器核对的，不是声明的。** 用例在**收集期**登记自己覆盖的行，文件末尾把
 *    登记结果与 spec.md 里那张表**当场解析出来的**行文本逐字比对。spec.md 加一行而没人加用例 → 红；
 *    改一行措辞 → 也红。后者是刻意的：这张表是契约，措辞变了通常意味着语义变了，红一次逼一次复核，
 *    比某一行悄悄失去覆盖便宜得多。
 */

import { describe, expect, it } from 'vitest';
// 本包的测试跑在 chromium 里，没有 node:fs。要拿 spec.md 的**原文**做逐行核对，唯一的办法是
// Vite 的 `?raw`——比对的是仓库里那份规格，而不是「我记得它写了 11 行」。
// eslint-disable-next-line @nx/enforce-module-boundaries -- specs/ 不是 Nx 项目，是这条判定的规格原文，越过包边界读的正是它
import SPEC_MARKDOWN from '../../../../../specs/001-working-tree-commits/spec.md?raw';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import {
  classifyWriteEntrance,
  WRITE_ENTRANCES,
  WRITE_TARGET_CLASSES,
  type WriteEntranceDecision,
  type WriteEntranceRequest
} from '../../working-tree/write-entry-matrix.js';

/** spec.md「写入口语义矩阵」第一列的行文本，逐字抄录——与 `?raw` 解析结果的比对键。 */
const MATRIX_ROW = {
  crud: '普通 CRUD、显式事务、Workspace 草稿 `save()`',
  domainRecompute: '`mergeBranch()`、undo/redo、restore/discard',
  remoteApply: '`pull()` / autoSync / `pullRepository()` / `sync()` 的实体应用',
  syncMetadata: '只更新 `remoteId`、同步水位或审计时间',
  cleanupExpired: '`cleanupExpired()` 的过期删除',
  projectionRewrite: 'branch switch、baseline/restore 物化、commit 后的工作树清空',
  metadataOnlyPrefetch: 'metadata-only 目标分支的远端预取',
  queryCache: 'QueryCache 的 upsert/delete/孤儿清理与离线出站重放',
  rawWrite: 'raw SQL、adapter 直写或其他 trigger bypass',
  bulkWrite: '`upsertMany()` / `deleteByIds()` 等 adapter 公开批量写方法',
  notifyExternalUpdate: '`EntityManager.notifyExternalUpdate()`'
} as const;

/** 收集期累积的覆盖登记，供文件末尾与 spec.md 的解析结果比对。 */
const coveredRows = new Set<string>();

/**
 * 注册一条用例并登记它覆盖的矩阵行。
 *
 * 登记发生在**收集期**（`describe` 体执行时），不是在 `it` 体里——后者要靠「末尾那条用例一定最后跑」
 * 才成立，而 `-t` 过滤、`it.only`、以后有人调整顺序都会让它悄悄失真。
 */
function matrixCase(row: string, name: string, body: () => void): void {
  coveredRows.add(row);
  it(name, body);
}

const UNTRACKED_FIELDS: readonly string[] = ['remoteId', 'updatedAt', 'syncedAt'];

/** 默认是「本地 CRUD 整行更新一张版本化业务表」，各用例只改它关心的那几项。 */
const request = (init: Partial<WriteEntranceRequest> = {}): WriteEntranceRequest => ({
  entrance: 'crud',
  targetClass: 'versioned',
  operation: 'update',
  columns: { kind: 'whole_row' },
  untrackedFields: UNTRACKED_FIELDS,
  capabilityEnabled: true,
  ...init
});

const columns = (...names: readonly string[]): WriteEntranceRequest['columns'] => ({ kind: 'columns', names });

type CaptureDecision = Extract<WriteEntranceDecision, { kind: 'capture' }>;

/** 收窄到捕获结论，顺带把「期望捕获却没捕获」变成一条读得懂的失败。 */
const asCapture = (decision: WriteEntranceDecision): CaptureDecision => {
  if (decision.kind !== 'capture') expect.unreachable(`期望落成工作树单元，实际是 ${decision.kind}`);
  return decision;
};

describe('行 1 — 普通 CRUD / 显式事务 / Workspace 草稿 save()', () => {
  matrixCase(MATRIX_ROW.crud, '写版本化业务表 → local 单元并递增 revision', () => {
    expect(classifyWriteEntrance(request({ entrance: 'crud' }))).toEqual({
      kind: 'capture',
      origin: 'local',
      revisionBump: true,
      pushableChange: true
    });
  });

  matrixCase(MATRIX_ROW.crud, '同一个入口写 QueryCache 实体 → 不进工作树', () => {
    // 入口身份没变，只是目标类变了。判定要是按调用方分派，这一条就得靠调用点自己判断——
    // 于是每个挂载点都得抄一遍 QueryCache 清单。
    expect(classifyWriteEntrance(request({ entrance: 'crud', targetClass: 'query_cache' }))).toEqual({
      kind: 'no_capture',
      reason: 'query_cache',
      revisionBump: false
    });
  });
});

describe('行 2 — mergeBranch() / undo·redo / restore·discard', () => {
  matrixCase(MATRIX_ROW.domainRecompute, '领域操作重算工作树 → 照样落 local 单元', () => {
    expect(classifyWriteEntrance(request({ entrance: 'domain_recompute' }))).toEqual({
      kind: 'capture',
      origin: 'local',
      revisionBump: true,
      pushableChange: true
    });
  });

  matrixCase(MATRIX_ROW.domainRecompute, '与行 6 的物化重写结论相反，二者不可合并', () => {
    // 这两行最容易被合成一条「内部路径，不用记」。合错的代价不对称：undo 的结果没进工作树，
    // 用户提交时看到的是撤销之前的状态，而且没有任何报错。
    const recompute = classifyWriteEntrance(request({ entrance: 'domain_recompute', operation: 'delete' }));
    const rewrite = classifyWriteEntrance(request({ entrance: 'projection_rewrite', operation: 'delete' }));
    expect(recompute.kind).toBe('capture');
    expect(rewrite.kind).toBe('no_capture');
    expect(recompute.revisionBump).not.toBe(rewrite.revisionBump);
  });
});

describe('行 3 — pull / autoSync / pullRepository / sync 的实体应用', () => {
  matrixCase(MATRIX_ROW.remoteApply, '远端实体应用 → remote_sync 单元，且不形成 push echo', () => {
    expect(classifyWriteEntrance(request({ entrance: 'remote_entity_apply' }))).toEqual({
      kind: 'capture',
      origin: 'remote_sync',
      revisionBump: true,
      pushableChange: false
    });
  });

  matrixCase(MATRIX_ROW.remoteApply, '与本地 CRUD 只差 origin 与 pushable，捕获与 revision 一致', () => {
    // 「远端来的不算变更」是最省事的错误做法：工作树里少掉 remote_sync 单元之后，冷重放立刻对不上，
    // 但只有跑了冷重放才看得见——所以这里先把「捕获与否不看来源」钉死。
    const local = asCapture(classifyWriteEntrance(request({ entrance: 'crud' })));
    const remote = asCapture(classifyWriteEntrance(request({ entrance: 'remote_entity_apply' })));
    expect(local.revisionBump).toBe(remote.revisionBump);
    expect(local.origin).not.toBe(remote.origin);
    expect(local.pushableChange).not.toBe(remote.pushableChange);
  });
});

describe('行 4 — 只更新 remoteId / 同步水位 / 审计时间', () => {
  matrixCase(MATRIX_ROW.syncMetadata, '只写 remoteId → 不创建单元、不递增 revision', () => {
    expect(classifyWriteEntrance(request({ entrance: 'remote_entity_apply', columns: columns('remoteId') }))).toEqual({
      kind: 'no_capture',
      reason: 'no_net_change',
      revisionBump: false
    });
  });

  matrixCase(MATRIX_ROW.syncMetadata, '只写审计时间与水位列 → 同上', () => {
    expect(classifyWriteEntrance(request({ columns: columns('updatedAt', 'syncedAt') }))).toEqual({
      kind: 'no_capture',
      reason: 'no_net_change',
      revisionBump: false
    });
  });

  matrixCase(MATRIX_ROW.syncMetadata, '元数据列里夹一个业务列 → 整条按净变化捕获', () => {
    // 判据是「列集 ⊆ untracked 字段域」，不是「列集 ∩ untracked ≠ ∅」。按交集判会让
    // `SET remoteId = ?, title = ?` 整条豁免，用户改的标题就此不在工作树里。
    expect(classifyWriteEntrance(request({ columns: columns('remoteId', 'title') }))).toEqual({
      kind: 'capture',
      origin: 'local',
      revisionBump: true,
      pushableChange: true
    });
  });

  matrixCase(MATRIX_ROW.syncMetadata, '零列的 UPDATE 是语义 no-op → 不递增 revision', () => {
    expect(classifyWriteEntrance(request({ columns: columns() }))).toEqual({
      kind: 'no_capture',
      reason: 'no_net_change',
      revisionBump: false
    });
  });

  matrixCase(MATRIX_ROW.syncMetadata, 'DELETE 不因列集看着像元数据就豁免', () => {
    // 删一行不是「只更新了元数据列」，无论调用方在 columns 里填了什么。能被这么填出来的豁免
    // 是绕过捕获最短的一条路径，所以判定不看 columns，直接按净变化处理。
    expect(
      classifyWriteEntrance(
        request({ entrance: 'remote_entity_apply', operation: 'delete', columns: columns('remoteId') })
      )
    ).toEqual({ kind: 'capture', origin: 'remote_sync', revisionBump: true, pushableChange: false });
  });

  matrixCase(MATRIX_ROW.syncMetadata, 'INSERT 同理：新行本身就是净变化', () => {
    expect(classifyWriteEntrance(request({ operation: 'insert', columns: columns('remoteId', 'updatedAt') }))).toEqual({
      kind: 'capture',
      origin: 'local',
      revisionBump: true,
      pushableChange: true
    });
  });

  matrixCase(MATRIX_ROW.syncMetadata, '列集无法确定时不算子集（fail-closed）', () => {
    const decision = classifyWriteEntrance(request({ columns: { kind: 'unknown' } }));
    expect(decision.kind).toBe('capture');
  });

  matrixCase(MATRIX_ROW.syncMetadata, 'untracked 字段域是注入的，判定里没有第二份清单', () => {
    // 同一条写，换一份 untracked 清单就换一个结论——这正是「清单不在判定里」的可观测形式。
    // 判定要是自带清单，这两次调用会给出同一个答案。
    const withRemoteIdUntracked = classifyWriteEntrance(request({ columns: columns('remoteId') }));
    const withEmptyList = classifyWriteEntrance(request({ columns: columns('remoteId'), untrackedFields: [] }));
    expect(withRemoteIdUntracked.kind).toBe('no_capture');
    expect(withEmptyList.kind).toBe('capture');
  });
});

describe('行 5 — cleanupExpired() 的过期删除', () => {
  matrixCase(MATRIX_ROW.cleanupExpired, '过期删除 → remote_sync 单元并递增 revision', () => {
    // 「内部清理，不用记」是这一行最常见的误判。漏记之后，被清理掉的实体在工作树里没有 DELETE 单元，
    // 冷重放会把它们重放回来——业务表里没有、重放出来有，正好是冷重放不变量的反例。
    expect(classifyWriteEntrance(request({ entrance: 'cleanup_expired', operation: 'delete' }))).toEqual({
      kind: 'capture',
      origin: 'remote_sync',
      revisionBump: true,
      pushableChange: false
    });
  });

  matrixCase(MATRIX_ROW.cleanupExpired, '同一次清理推进水位（系统表）不建单元', () => {
    expect(classifyWriteEntrance(request({ entrance: 'cleanup_expired', targetClass: 'system' }))).toEqual({
      kind: 'no_capture',
      reason: 'system_target',
      revisionBump: false
    });
  });
});

describe('行 6 — branch switch / baseline·restore 物化 / commit 后的工作树清空', () => {
  matrixCase(MATRIX_ROW.projectionRewrite, '底层投影重写照常发生，但不被二次记录', () => {
    // 关键在于结论是 no_capture 而不是 reject：物化必须写得进去。判成 reject 的话，
    // 切分支这件事本身会失败。
    expect(classifyWriteEntrance(request({ entrance: 'projection_rewrite' }))).toEqual({
      kind: 'no_capture',
      reason: 'domain_managed',
      revisionBump: false
    });
  });
});

describe('行 7 — metadata-only 目标分支的远端预取', () => {
  matrixCase(MATRIX_ROW.metadataOnlyPrefetch, '写 staging 与独立水位 → 放行且不建单元', () => {
    expect(classifyWriteEntrance(request({ entrance: 'metadata_only_prefetch', targetClass: 'system' }))).toEqual({
      kind: 'no_capture',
      reason: 'system_target',
      revisionBump: false
    });
  });

  matrixCase(MATRIX_ROW.metadataOnlyPrefetch, '预取碰到当前分支的业务表 → 拒绝', () => {
    // 「不动当前分支同步状态或业务表」得有人执行。预取本来只该写 staging，它出现在版本化业务表上
    // 意味着目标分支的数据正在覆盖当前分支的投影——这是静默的数据损坏，不是可以捕获下来的变更。
    expect(classifyWriteEntrance(request({ entrance: 'metadata_only_prefetch' }))).toEqual({
      kind: 'reject',
      code: CommitErrorCode.commit_capability_mismatch,
      revisionBump: false
    });
  });
});

describe('行 8 — QueryCache 的 upsert/delete/孤儿清理与离线出站重放', () => {
  matrixCase(MATRIX_ROW.queryCache, 'QueryCache 维护 → 放行，且不进 baseline/status/diff/commit', () => {
    expect(classifyWriteEntrance(request({ entrance: 'query_cache_maintenance', targetClass: 'query_cache' }))).toEqual(
      {
        kind: 'no_capture',
        reason: 'query_cache',
        revisionBump: false
      }
    );
  });

  matrixCase(MATRIX_ROW.queryCache, '缓存维护路径碰到版本化实体表 → 拒绝', () => {
    expect(classifyWriteEntrance(request({ entrance: 'query_cache_maintenance' })).kind).toBe('reject');
  });
});

describe('行 9 — raw SQL / adapter 直写 / 其他 trigger bypass', () => {
  matrixCase(MATRIX_ROW.rawWrite, '写版本化业务表且列集不明 → commit_capability_mismatch', () => {
    expect(classifyWriteEntrance(request({ entrance: 'raw_write', columns: { kind: 'unknown' } }))).toEqual({
      kind: 'reject',
      code: CommitErrorCode.commit_capability_mismatch,
      revisionBump: false
    });
  });

  matrixCase(MATRIX_ROW.rawWrite, '只触及 untracked 字段域 → 放行，且同样不建单元', () => {
    // 5 步判定第 5 步：放行的 raw 元数据写不会因为「是 raw」而获得一个单元，也不会递增 revision。
    expect(classifyWriteEntrance(request({ entrance: 'raw_write', columns: columns('remoteId') }))).toEqual({
      kind: 'no_capture',
      reason: 'no_net_change',
      revisionBump: false
    });
  });

  matrixCase(MATRIX_ROW.rawWrite, '写系统表 → 放行', () => {
    const decision = classifyWriteEntrance(
      request({ entrance: 'raw_write', targetClass: 'system', columns: { kind: 'unknown' } })
    );
    expect(decision).toEqual({ kind: 'no_capture', reason: 'system_target', revisionBump: false });
  });
});

describe('行 10 — upsertMany() / deleteByIds() 等 adapter 公开批量写方法', () => {
  matrixCase(MATRIX_ROW.bulkWrite, '版本化实体一律拒绝（入参是整行，不是列集）', () => {
    expect(classifyWriteEntrance(request({ entrance: 'bulk_write', columns: { kind: 'whole_row' } }))).toEqual({
      kind: 'reject',
      code: CommitErrorCode.commit_capability_mismatch,
      revisionBump: false
    });
  });

  matrixCase(MATRIX_ROW.bulkWrite, '整行永远不是 untracked 子集——哪怕整张表都在清单里', () => {
    // 极端输入：把这张表的每一列都声明成 untracked。整行写入仍然落第 4 步，因为「整行」说的是
    // 「这一行被整体替换」，而不是「这些列被写了」。
    const decision = classifyWriteEntrance(
      request({
        entrance: 'bulk_write',
        operation: 'insert',
        columns: { kind: 'whole_row' },
        untrackedFields: ['id', 'title', 'remoteId', 'updatedAt', 'syncedAt']
      })
    );
    expect(decision.kind).toBe('reject');
  });

  matrixCase(MATRIX_ROW.bulkWrite, '目标是 QueryCache 实体表 → 放行', () => {
    expect(classifyWriteEntrance(request({ entrance: 'bulk_write', targetClass: 'query_cache' }))).toEqual({
      kind: 'no_capture',
      reason: 'query_cache',
      revisionBump: false
    });
  });
});

describe('行 11 — EntityManager.notifyExternalUpdate()', () => {
  matrixCase(MATRIX_ROW.notifyExternalUpdate, '对版本化实体 → commit_capability_mismatch', () => {
    // 契约原文是「而不是发出没有工作树单元支撑的事件」：拒绝的替代品不是「照发事件」，
    // 那会让 UI 显示一份工作树里不存在的变更。
    expect(classifyWriteEntrance(request({ entrance: 'notify_external_update' }))).toEqual({
      kind: 'reject',
      code: CommitErrorCode.commit_capability_mismatch,
      revisionBump: false
    });
  });

  matrixCase(MATRIX_ROW.notifyExternalUpdate, '对 QueryCache 实体行为不变', () => {
    expect(classifyWriteEntrance(request({ entrance: 'notify_external_update', targetClass: 'query_cache' }))).toEqual({
      kind: 'no_capture',
      reason: 'query_cache',
      revisionBump: false
    });
  });
});

describe('未启用提交能力的库：零行为差异（FR-046）', () => {
  it('任何入口 × 任何目标类都只得到 capability_disabled', () => {
    for (const entrance of WRITE_ENTRANCES) {
      for (const targetClass of WRITE_TARGET_CLASSES) {
        const decision = classifyWriteEntrance(
          request({ entrance, targetClass, capabilityEnabled: false, columns: { kind: 'unknown' } })
        );
        expect(decision, `${entrance} × ${targetClass}`).toEqual({
          kind: 'no_capture',
          reason: 'capability_disabled',
          revisionBump: false
        });
      }
    }
  });

  it('能力位的判断先于入口许可', () => {
    // 最极端的一条输入：未知入口 + 版本化表 + 解析不出列集。启用时它必须被拒，未启用时它必须放行。
    // 顺序反过来的实现会在这里拒绝——而这个库根本没打算用提交能力。
    const decision = classifyWriteEntrance(
      request({ entrance: 'unknown', columns: { kind: 'unknown' }, capabilityEnabled: false })
    );
    expect(decision).toEqual({ kind: 'no_capture', reason: 'capability_disabled', revisionBump: false });
  });
});

describe('未知入口默认拒绝', () => {
  it('未登记的入口写版本化业务表 → 拒绝，不能先写完再靠事件补记', () => {
    expect(classifyWriteEntrance(request({ entrance: 'unknown' }))).toEqual({
      kind: 'reject',
      code: CommitErrorCode.commit_capability_mismatch,
      revisionBump: false
    });
  });

  it('未登记的入口写 QueryCache → 放行', () => {
    // fail-closed 的保护对象是版本化业务表。把 QueryCache 一并拒了，等于让所有未登记的缓存维护
    // 路径开始报错，而缓存里没有任何需要保护的东西。
    expect(classifyWriteEntrance(request({ entrance: 'unknown', targetClass: 'query_cache' })).kind).toBe('no_capture');
  });

  it('`unknown` 本身在入口登记表里，且登记表无重复', () => {
    expect(WRITE_ENTRANCES).toContain('unknown');
    expect(new Set(WRITE_ENTRANCES).size).toBe(WRITE_ENTRANCES.length);
    expect(new Set(WRITE_TARGET_CLASSES)).toEqual(new Set(['versioned', 'query_cache', 'system']));
  });
});

describe('跨全部组合的结构不变量', () => {
  const COLUMN_SHAPES: readonly WriteEntranceRequest['columns'][] = [
    { kind: 'whole_row' },
    { kind: 'unknown' },
    columns('remoteId'),
    columns('title'),
    columns()
  ];
  const OPERATIONS: readonly WriteEntranceRequest['operation'][] = ['insert', 'update', 'delete'];

  it('是总函数：任何组合都给出结论，从不抛错', () => {
    let count = 0;
    for (const entrance of WRITE_ENTRANCES) {
      for (const targetClass of WRITE_TARGET_CLASSES) {
        for (const shape of COLUMN_SHAPES) {
          for (const operation of OPERATIONS) {
            const decision = classifyWriteEntrance(request({ entrance, targetClass, columns: shape, operation }));
            expect(['capture', 'no_capture', 'reject']).toContain(decision.kind);
            count += 1;
          }
        }
      }
    }
    expect(count).toBe(WRITE_ENTRANCES.length * WRITE_TARGET_CLASSES.length * COLUMN_SHAPES.length * OPERATIONS.length);
  });

  it('落单元 ⇔ 递增 revision，全组合无例外', () => {
    for (const entrance of WRITE_ENTRANCES) {
      for (const targetClass of WRITE_TARGET_CLASSES) {
        for (const shape of COLUMN_SHAPES) {
          for (const operation of OPERATIONS) {
            const decision = classifyWriteEntrance(request({ entrance, targetClass, columns: shape, operation }));
            expect(decision.revisionBump, `${entrance} × ${targetClass} × ${shape.kind} × ${operation}`).toBe(
              decision.kind === 'capture'
            );
          }
        }
      }
    }
  });

  it('拒绝与不捕获是两个结论，只有拒绝带错误码', () => {
    const rejected = classifyWriteEntrance(request({ entrance: 'unknown' }));
    const allowed = classifyWriteEntrance(request({ entrance: 'projection_rewrite' }));
    expect(rejected.kind).toBe('reject');
    expect(allowed.kind).toBe('no_capture');
    expect('code' in rejected).toBe(true);
    expect('code' in allowed).toBe(false);
  });

  it('是纯函数：不修改入参', () => {
    const input = request({ entrance: 'raw_write', columns: columns('remoteId') });
    const before = structuredClone(input);
    classifyWriteEntrance(input);
    expect(input).toEqual(before);
  });
});

describe('每一行至少一条用例（与 spec.md 当场比对）', () => {
  /** 从 spec.md 里把「写入口语义矩阵」那张表的第一列抽出来。 */
  function parseMatrixEntrances(markdown: string): readonly string[] {
    const heading = '#### 写入口语义矩阵';
    const start = markdown.indexOf(heading);
    if (start < 0) throw new Error(`spec.md 里找不到「${heading}」小节`);
    const rest = markdown.slice(start + heading.length);
    const end = rest.indexOf('\n#### ');
    const section = end < 0 ? rest : rest.slice(0, end);
    const rows: string[] = [];
    for (const line of section.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) continue;
      const cells = trimmed
        .split('|')
        .slice(1, -1)
        .map(cell => cell.trim());
      if (cells.length < 2) continue;
      if (/^-+$/.test(cells[0])) continue;
      if (cells[0] === '写入口') continue;
      rows.push(cells[0]);
    }
    return rows;
  }

  it('spec.md 的矩阵是 11 行且行文本互不相同', () => {
    const parsed = parseMatrixEntrances(SPEC_MARKDOWN);
    expect(parsed).toHaveLength(11);
    expect(new Set(parsed).size).toBe(parsed.length);
  });

  it('登记的覆盖行与 spec.md 解析出的行逐字相等', () => {
    // 两个方向都会红：spec.md 多一行而没人加用例 → 左边少；用例登记了一个表里没有的键（改名、
    // 手抄漂移）→ 右边少。只比数量的话两种漂移可以互相抵消。
    const parsed = [...parseMatrixEntrances(SPEC_MARKDOWN)].sort();
    expect([...coveredRows].sort()).toEqual(parsed);
  });

  it('常量表 MATRIX_ROW 的每个键都被真的用到了', () => {
    expect([...Object.values(MATRIX_ROW)].sort()).toEqual([...coveredRows].sort());
  });
});
