/**
 * @fileoverview T050 红测试：raw 写路径的 5 步 bypass 判定（adapter-contract.md §2、FR-046）。
 *
 * @remarks
 * 判定只有一份，落在 `packages/rxdb`，由 6 个适配器各自的 `rawQuery` 调用。所以这里测的是
 * **一份纯判定**（`judgeRawWrite`：给一条语句，回答落在第几步）与**一个挂载壳**
 * （`applyRawWriteJudgment`：证明拒绝发生在语句执行之前）。两个导出各有各的失败形态，合成一个就测不全。
 *
 * 挂载壳的名字与核心那道接缝（`gateRawWrite`）**故意不同**：那一个只认能力位，判定实现由捕获运行时
 * 转交进来；这一个就是被转交进去的那份判定。同名会让「适配器手上那个上下文能不能直接喂给判定」
 * 变成要逐字段回忆的问题。
 *
 * 为什么这些断言值得写：
 *
 * 1. **结论里带「第几步」，不只带「拦没拦」。** 五步的顺序本身就是契约：同一条语句可能同时满足
 *    第 1 步与第 4 步（未启用能力 + 写版本化表），落哪一步决定了未启用的库是照常工作还是开始报错。
 *    只断言 allow/reject 的话，把第 1 步挪到第 4 步之后仍然全绿，而那是一次面向所有未启用用户的故障。
 * 2. **第 4 步断的是「业务表零变化」，不是「写完回滚」。** 所以挂载壳拿的是**还没被调用的**执行器，
 *    用例直接断言它一次都没被调用。回滚形态在单测里同样能给出正确的错误类型——但它在没有事务的
 *    raw 通道上根本回滚不了，而这正是 raw 通道存在的原因。
 * 3. **解析不出来时必须落第 4 步（fail-closed）。** 目标表解析不出、列集解析不出、语句批里混了第二条
 *    写语句——这三类都得拦。反过来的读法（解析不出就放行）会让绕过捕获变成一道语法题：只要把语句
 *    写得判定读不懂就行。
 * 4. **词法归一化是判定的一部分，不是调用方的责任。** 大小写、引号标识符、schema 限定三种写法在
 *    6 个后端上混着出现；归一化交给调用方意味着 6 份实现，而它们只需要有一份写松，整条防线就有洞。
 * 5. **`INSERT` 不因为列名都在 untracked 域里就获得豁免。** 第 5 步的豁免对象是「只更新元数据列」的
 *    UPDATE；新插入一行本身就是净变化。与写入口语义矩阵（T048）行 4 的判据逐字同源，两处不一致时
 *    raw 通道会成为那条更松的路。
 * 6. **受信 intent 是内部契约，不是公开参数。** 它排在第 2 步——在「是不是写语句」之前——因为登记表里
 *    的路径（分支物化、基线重写）本来就要写版本化表，让它们先过第 3、4 步再靠豁免捞回来，等于把
 *    判定写成「先拦下再放行」，而每加一条受信路径都要再改一次拦截逻辑。
 * 7. **判定是纯的。** 同一条语句判两次结果相同，且不动传进来的域集合——域是 T056 那一份清单的视图，
 *    判定顺手改它会让下一次判定基于被改过的域。
 */

import { SyncType, TrustedWriteIntent } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import {
  applyRawWriteJudgment,
  judgeRawWrite,
  type RawWriteJudgmentContext,
  type VersionedDomainView
} from '../../working-tree/raw-write-judgment.js';
import { buildVersionedDomain } from '../../working-tree/versioned-domain.js';
import { WorkingTreeWriteRejectedError } from '../../working-tree/write-entry-matrix.js';

/**
 * 测试用的版本化域视图。
 *
 * 名字一律给成**已归一化**的形态（小写、无引号、无 schema 限定）——归一化是判定对**语句**做的事，
 * 域本身由 T056 的单一清单产出，不该也归一化两遍。
 */
const domain = (): VersionedDomainView => ({
  versionedTables: new Set(['post', 'comment']),
  // 按表取而不是一个全表通用集合：簿记字段（`remote_id` 等）确实全域通用，但派生索引列是
  // 插件**在某张业务表上**登记的（spec.md「版本化域」第三类）。压成一个集合的话，`post` 上
  // 登记的 `title_norm` 会连带让 `comment` 的同名列获得豁免。
  untrackedFieldsOf: (table: string) =>
    new Set(
      table === 'post' ?
        ['remote_id', 'updated_at', 'synced_at', 'title_norm']
      : ['remote_id', 'updated_at', 'synced_at']
    )
});

const context = (init: Partial<RawWriteJudgmentContext> = {}): RawWriteJudgmentContext => ({
  capabilityEnabled: true,
  domain: domain(),
  ...init
});

/** 判定并要求落在 reject 上，顺带把「本该拦下却放行了」变成读得懂的失败。 */
function rejectionFor(sql: string, ctx: RawWriteJudgmentContext = context()) {
  const judgment = judgeRawWrite(sql, ctx);
  if (judgment.kind !== 'reject') expect.unreachable(`期望第 4 步拦下，实际落在第 ${judgment.step} 步：${sql}`);
  return judgment;
}

/** 判定并要求落在 allow 上。 */
function allowanceFor(sql: string, ctx: RawWriteJudgmentContext = context()) {
  const judgment = judgeRawWrite(sql, ctx);
  if (judgment.kind !== 'allow') expect.unreachable(`期望放行，实际被第 ${judgment.step} 步拦下：${sql}`);
  return judgment;
}

describe('第 1 步 — 提交能力未启用即放行', () => {
  it('最该被拦的那条语句也放行', () => {
    // 未启用的库上，raw 通道必须与没装这个版本时逐字节一致。
    expect(allowanceFor("UPDATE post SET title = 'x'", context({ capabilityEnabled: false }))).toEqual({
      kind: 'allow',
      step: 1,
      reason: 'capability_disabled'
    });
  });

  it('解析不出目标表的语句同样放行', () => {
    expect(allowanceFor('EXECUTE some_prepared_statement', context({ capabilityEnabled: false })).step).toBe(1);
  });

  it('排在受信 intent 之前：不带 intent 也不报错', () => {
    const judgment = allowanceFor('DROP TABLE post', context({ capabilityEnabled: false }));
    expect(judgment.reason).toBe('capability_disabled');
  });
});

describe('第 2 步 — 受信 intent 放行', () => {
  it('分支物化写版本化表 → 放行', () => {
    expect(
      allowanceFor("UPDATE post SET title = 'x'", context({ intent: TrustedWriteIntent.branch_materialization }))
    ).toEqual({ kind: 'allow', step: 2, reason: 'trusted_intent' });
  });

  it('排在「是不是写语句」之前：读语句带 intent 也报第 2 步', () => {
    // 顺序有可观测形式，这条就是它：登记表里的路径不必先过完第 3、4 步再被捞回来。
    expect(
      allowanceFor('SELECT * FROM post', context({ intent: TrustedWriteIntent.branch_materialization })).step
    ).toBe(2);
  });

  it('不带 intent 的同一条语句被拦下', () => {
    expect(rejectionFor("UPDATE post SET title = 'x'").step).toBe(4);
  });
});

describe('第 3 步 — 非写语句放行', () => {
  it('对版本化表的 SELECT', () => {
    expect(allowanceFor('SELECT id, title FROM post WHERE id = 1')).toEqual({
      kind: 'allow',
      step: 3,
      reason: 'not_a_write'
    });
  });

  it('纯读的 CTE', () => {
    expect(allowanceFor('WITH recent AS (SELECT * FROM post LIMIT 10) SELECT * FROM recent').step).toBe(3);
  });

  it('写在 CTE 里的 UPDATE 不算读语句', () => {
    // `WITH x AS (UPDATE …) SELECT` 是一条以 WITH 开头的**写**语句。按首关键字分类的实现会在这里放行，
    // 而它写的正是版本化业务表。
    expect(rejectionFor("WITH moved AS (UPDATE post SET title = 'x' RETURNING id) SELECT * FROM moved").step).toBe(4);
  });
});

describe('第 4 步 — 写到版本化业务表且列集不是 untracked 子集', () => {
  it('UPDATE 报出被命中的表', () => {
    const judgment = rejectionFor("UPDATE post SET title = 'x' WHERE id = 1");
    expect(judgment).toMatchObject({ kind: 'reject', step: 4, code: CommitErrorCode.commit_capability_mismatch });
    expect(judgment.tables).toEqual(['post']);
  });

  it('DELETE 与 INSERT 一样拦', () => {
    expect(rejectionFor('DELETE FROM post WHERE id = 1').step).toBe(4);
    expect(rejectionFor("INSERT INTO comment (id, body) VALUES ('c1', 'hi')").step).toBe(4);
  });

  it('DDL 也是写：DROP / ALTER 版本化表被拦', () => {
    // 迁移确实要做 DDL，但它走第 2 步的受信 intent；没有 intent 的 `DROP TABLE post` 会让业务数据
    // 整张消失而工作树里一个单元都没有。
    expect(rejectionFor('DROP TABLE post').step).toBe(4);
    expect(rejectionFor('ALTER TABLE post ADD COLUMN subtitle TEXT').step).toBe(4);
  });

  it('列集里混入业务列 → 整条拦下', () => {
    expect(rejectionFor("UPDATE post SET remote_id = 'r1', title = 'x'").step).toBe(4);
  });

  it('INSERT 的列名全在 untracked 域里也拦', () => {
    // 豁免只对「只更新元数据列」的 UPDATE 成立；新插入一行本身就是净变化。
    expect(rejectionFor("INSERT INTO post (remote_id) VALUES ('r1')").step).toBe(4);
  });

  it('被拦时错误里带得走的诊断信息', () => {
    const judgment = rejectionFor("UPDATE post SET title = 'x'");
    expect(judgment.tables).toContain('post');
    expect(judgment.code).toBe(CommitErrorCode.commit_capability_mismatch);
  });
});

describe('第 4 步的 fail-closed：解析不出就当命中', () => {
  it('目标表解析不出', () => {
    expect(rejectionFor('EXECUTE write_plan(1, 2)').step).toBe(4);
  });

  it('列集解析不出（INSERT … SELECT）', () => {
    expect(rejectionFor('INSERT INTO post SELECT * FROM post_archive').step).toBe(4);
  });

  it('列集解析不出（子查询赋值）', () => {
    expect(rejectionFor('UPDATE post SET (title, body) = (SELECT title, body FROM post_archive LIMIT 1)').step).toBe(4);
  });

  it('语句批里第二条才写版本化表', () => {
    // 追加一条语句是最省事的一种绕过：判定只看第一条的话，前面放一条无害语句就够了。
    expect(rejectionFor("UPDATE app_setting SET value = '1'; UPDATE post SET title = 'x'").step).toBe(4);
  });
});

describe('第 5 步 — 其余写目标与「只碰 untracked 列」的写入', () => {
  it('只更新 remote_id 的 UPDATE', () => {
    expect(allowanceFor("UPDATE post SET remote_id = 'r1' WHERE id = 1")).toEqual({
      kind: 'allow',
      step: 5,
      reason: 'untracked_only'
    });
  });

  it('多列但都在 untracked 域里', () => {
    expect(allowanceFor("UPDATE post SET remote_id = 'r1', synced_at = 1, updated_at = 2").reason).toBe(
      'untracked_only'
    );
  });

  it('QueryCache 实体表 / 系统表 / FTS 影子表 / 临时表', () => {
    expect(allowanceFor("UPDATE product_cache SET payload = '{}'").reason).toBe('out_of_domain');
    expect(allowanceFor("INSERT INTO rxdb_change (id) VALUES ('c1')").reason).toBe('out_of_domain');
    expect(allowanceFor("INSERT INTO post_fts (rowid, title) VALUES (1, 'x')").reason).toBe('out_of_domain');
    expect(allowanceFor('CREATE TEMP TABLE tmp_ids (id TEXT)').reason).toBe('out_of_domain');
  });

  it('域是注入的：同一条语句换一份 untracked 域就换一个结论', () => {
    const narrowed: VersionedDomainView = { versionedTables: new Set(['post']), untrackedFieldsOf: () => new Set() };
    expect(allowanceFor("UPDATE post SET remote_id = 'r1'").reason).toBe('untracked_only');
    expect(judgeRawWrite("UPDATE post SET remote_id = 'r1'", context({ domain: narrowed })).kind).toBe('reject');
  });

  it('SET 子句里的子查询不截断列集', () => {
    // 这是词法切分写松时唯一不报错的形态：终止关键字若按正则「第一个 from/where」找，
    // 子查询里的 `from` 就会把 SET 子句提前截断，`title` 整列从列集里消失，于是一条
    // 真在改 tracked 列的语句拿到 `untracked_only` 放行——**静默绕过捕获**。
    expect(
      rejectionFor("UPDATE post SET remote_id = (SELECT id FROM post_archive WHERE k = 1), title = 'x'").step
    ).toBe(4);
  });

  it('子查询之后的列仍在列集里：全是 untracked 列时照常放行', () => {
    // 反向对照。少了它，把 `columnsOf` 改成「一见子查询就 fail-closed」也能让上一条绿，
    // 而那会把一批本该放行的写全拦下来。
    expect(
      allowanceFor('UPDATE post SET remote_id = (SELECT id FROM post_archive WHERE k = 1), synced_at = 1').reason
    ).toBe('untracked_only');
  });

  it('顶层的 FROM 仍然终止 SET 子句（PG 的 `UPDATE … FROM`）', () => {
    // 与上一条相反的方向：终止关键字不能干脆不找。不终止的话，`FROM` 列表里那个顶层逗号
    // 会被当成又一段赋值，切出来的第二段匹配不上赋值形态 → 列集解析不出 → 第 4 步拦下。
    expect(allowanceFor('UPDATE post SET remote_id = o.id FROM other o, another a WHERE o.k = a.k').reason).toBe(
      'untracked_only'
    );
  });

  it('untracked 字段域按表取：`post` 上登记的派生索引列不豁免 `comment`', () => {
    // 判定必须拿**被写的那张表**去问域。用任意一张表去问（或先并成一个集合）都会让登记在别处的
    // 列名在这里获得豁免——而豁免列表是插件可以往里加东西的。
    expect(allowanceFor("UPDATE post SET title_norm = 'x'").reason).toBe('untracked_only');
    expect(rejectionFor("UPDATE comment SET title_norm = 'x'").step).toBe(4);
  });
});

describe('词法归一化：大小写 / 引号标识符 / schema 限定', () => {
  it('大小写与关键字大小写都不影响判定', () => {
    expect(rejectionFor("update POST set TITLE = 'x'").step).toBe(4);
    expect(allowanceFor("UPDATE Post SET Remote_Id = 'r1'").reason).toBe('untracked_only');
  });

  it('引号标识符', () => {
    expect(rejectionFor('UPDATE "post" SET "title" = \'x\'').step).toBe(4);
    expect(rejectionFor('UPDATE "Post" SET "Title" = \'x\'').step).toBe(4);
  });

  it('schema 限定', () => {
    expect(rejectionFor("UPDATE public.post SET title = 'x'").step).toBe(4);
    expect(rejectionFor('UPDATE main."post" SET title = \'x\'').step).toBe(4);
  });

  it('归一化不会把不同的表名压成同一张', () => {
    // `post_archive` 不是 `post`。归一化写得太粗（比如去掉下划线后缀、前缀匹配）会把域外的表
    // 误判成域内，于是一批本来正常的写开始报错。
    expect(allowanceFor("UPDATE post_archive SET title = 'x'").reason).toBe('out_of_domain');
    expect(allowanceFor("UPDATE archive_post SET title = 'x'").reason).toBe('out_of_domain');
  });
});

describe('挂载壳 applyRawWriteJudgment：拒绝发生在语句执行之前', () => {
  /** 语句执行器探针：`calls` 是「业务表变没变」在单测里唯一诚实的替身。 */
  interface ExecutorProbe {
    calls: number;
    run: () => Promise<{ rows: readonly unknown[] }>;
  }

  const executorProbe = (): ExecutorProbe => {
    const probe: ExecutorProbe = {
      calls: 0,
      run: async () => {
        probe.calls += 1;
        return { rows: [] };
      }
    };
    return probe;
  };

  it('被拦时执行器一次都没被调用（业务表零变化）', async () => {
    const probe = executorProbe();

    await expect(applyRawWriteJudgment("UPDATE post SET title = 'x'", context(), probe.run)).rejects.toBeInstanceOf(
      WorkingTreeWriteRejectedError
    );

    expect(probe.calls).toBe(0);
  });

  it('抛出的错误带入口身份与错误码', async () => {
    const probe = executorProbe();
    const error = await applyRawWriteJudgment("UPDATE post SET title = 'x'", context(), probe.run).catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(WorkingTreeWriteRejectedError);
    expect((error as WorkingTreeWriteRejectedError).code).toBe(CommitErrorCode.commit_capability_mismatch);
    expect((error as WorkingTreeWriteRejectedError).entrance).toBe('raw_write');
  });

  it('放行时原样返回执行器的结果，只调用一次', async () => {
    const probe = executorProbe();

    const result = await applyRawWriteJudgment("UPDATE post SET remote_id = 'r1'", context(), probe.run);

    expect(result).toEqual({ rows: [] });
    expect(probe.calls).toBe(1);
  });

  it('未启用能力时照常执行', async () => {
    const probe = executorProbe();

    await applyRawWriteJudgment("UPDATE post SET title = 'x'", context({ capabilityEnabled: false }), probe.run);

    expect(probe.calls).toBe(1);
  });
});

describe('挂载壳与纯判定是同一份规则', () => {
  const CORPUS: readonly string[] = [
    "UPDATE post SET title = 'x'",
    "UPDATE post SET remote_id = 'r1'",
    'SELECT * FROM post',
    'DELETE FROM post WHERE id = 1',
    "INSERT INTO post (remote_id) VALUES ('r1')",
    "UPDATE product_cache SET payload = '{}'",
    'EXECUTE write_plan(1, 2)',
    'INSERT INTO post SELECT * FROM post_archive',
    "UPDATE app_setting SET value = '1'; UPDATE post SET title = 'x'",
    'DROP TABLE post'
  ];

  it('语料上「壳抛没抛」与判定结论逐条相等', async () => {
    for (const sql of CORPUS) {
      const expected = judgeRawWrite(sql, context()).kind === 'reject';
      const probe = { calls: 0 };
      const threw = await applyRawWriteJudgment(sql, context(), async () => {
        probe.calls += 1;
        return null;
      }).then(
        () => false,
        () => true
      );
      expect(threw, sql).toBe(expected);
      expect(probe.calls, sql).toBe(expected ? 0 : 1);
    }
  });

  it('判定是纯的：判两次结果相同，且不动传进来的域', () => {
    const ctx = context();
    const sizeBefore = [ctx.domain.versionedTables.size, ctx.domain.untrackedFieldsOf('post').size];

    const first = judgeRawWrite("UPDATE post SET remote_id = 'r1'", ctx);
    const second = judgeRawWrite("UPDATE post SET remote_id = 'r1'", ctx);

    expect(first).toEqual(second);
    expect([ctx.domain.versionedTables.size, ctx.domain.untrackedFieldsOf('post').size]).toEqual(sizeBefore);
  });
});

describe('第 5 步 — untracked_only 要对着**生产域**成立', () => {
  /**
   * 用 `buildVersionedDomain()` 真的造一个域，而不是本文件顶部那份手写的 {@link domain}。
   *
   * @remarks
   * 手写那份把 untracked 列名写成了 `remote_id` / `updated_at`——**恰好**与 `normalizeSql()`
   * 抹平之后的 SQL 词元同形，于是子集判定成立、第 5 步绿。生产域给的却是
   * `UNTRACKED_BOOKKEEPING_FIELDS`：`remoteId` / `createdAt` / `updatedAt`，驼峰。
   *
   * 两个平面的大小写口径不同不是笔误：实体平面的 `isUntrackedField()` **必须**大小写精确
   * （`remoteId` 与 `remoteid` 在 JS 里是两个属性），而 SQL 平面已经被 `normalizeSql()` 整体
   * 压成小写。判定把域原样递给 `hasNetChange()` 的精确字符串比对，两边就永远对不上——
   * 于是第 5 步的 `untracked_only` 在**任何真实数据库上**都不可达，一条只改审计时间的
   * 簿记写会被第 4 步拦成 `commit_capability_mismatch`。
   *
   * 这条缺陷躲过了本文件其余全部用例，只因为夹具恰好把域也写成了小写蛇形。
   */
  const productionDomain = (): VersionedDomainView =>
    buildVersionedDomain([
      { entityName: 'ConformanceNote', namespace: 'public', tableName: 'conformance_notes', syncType: SyncType.Full },
      {
        entityName: 'ConformanceCache',
        namespace: 'public',
        tableName: 'conformance_caches',
        syncType: SyncType.QueryCache
      }
    ]);

  const productionContext = (): RawWriteJudgmentContext => ({ capabilityEnabled: true, domain: productionDomain() });

  it('只改审计时间的 UPDATE 放行于第 5 步', () => {
    expect(allowanceFor('UPDATE conformance_notes SET "updatedAt" = now()', productionContext())).toEqual({
      kind: 'allow',
      step: 5,
      reason: 'untracked_only'
    });
  });

  it('只改 remoteId 的 UPDATE 放行于第 5 步', () => {
    expect(allowanceFor(`UPDATE conformance_notes SET "remoteId" = 'r-1'`, productionContext()).reason).toBe(
      'untracked_only'
    );
  });

  it('掺了一列业务字段就仍然落第 4 步', () => {
    // 放宽大小写不能顺手放宽列集：多一列 `title` 就是净变化。
    expect(rejectionFor(`UPDATE conformance_notes SET "updatedAt" = now(), title = 'x'`, productionContext())).toEqual({
      kind: 'reject',
      step: 4,
      code: CommitErrorCode.commit_capability_mismatch,
      tables: ['conformance_notes']
    });
  });

  it('QueryCache 表落第 5 步的 out_of_domain', () => {
    expect(allowanceFor(`UPDATE conformance_caches SET label = 'x'`, productionContext())).toEqual({
      kind: 'allow',
      step: 5,
      reason: 'out_of_domain'
    });
  });
});

describe('物理表名 — SQLite 家族把 schema 折进名字里（`${namespace}$${tableName}`）', () => {
  /**
   * 两种物理表名形态，同一份逻辑表名。
   *
   * @remarks
   * 6 个 v1 后端只有 PGlite 有真 schema，它的表引用是 `"public"."conformance_notes"`，
   * 归一化之后带点号，`lastSegment()` 切一刀就回到逻辑表名。**另外 5 个 SQLite 家族后端没有
   * schema**，`get_table_name()` 把命名空间折进名字本身：`public$conformance_notes`。它不带
   * 点号，`lastSegment()` 原样返回，与 `versionedTables` 里的 `conformance_notes` 对不上——
   * 于是落 `out_of_domain` 放行。
   *
   * 后果不是少拦一条边角语句，是 raw 门禁在 **5/6 的后端上整条失效**：在 wa-sqlite /
   * sqlite-wasm / sqlite / sqliteai / electron 上，用户能用后端唯一能用的那个表名把版本化
   * 业务表写穿，而捕获链一无所知，冷重放从此对不上。而这条缺陷躲过了本文件此前的全部用例，
   * 只因为它们都用逻辑表名（`post`）或 PG 形态（`public.post`）提问——恰好是 1/6 的那个后端。
   *
   * 域这边登记**全部可寻址形态**，而不是让判定去猜分隔符：判定继续只做集合成员判定，
   * 于是 `_fts_public$conformance_notes`（FTS 影子表，spec.md 明列的 `out_of_domain`）
   * 不会因为「切一刀 `$`」被误伤。
   */
  const physicalDomain = (): VersionedDomainView =>
    buildVersionedDomain([
      { entityName: 'ConformanceNote', namespace: 'public', tableName: 'conformance_notes', syncType: SyncType.Full },
      {
        entityName: 'ConformanceCache',
        namespace: 'public',
        tableName: 'conformance_caches',
        syncType: SyncType.QueryCache
      }
    ]);

  const physicalContext = (): RawWriteJudgmentContext => ({ capabilityEnabled: true, domain: physicalDomain() });

  it('`public$conformance_notes` 与逻辑表名一样落第 4 步', () => {
    expect(rejectionFor(`UPDATE public$conformance_notes SET title = 'x'`, physicalContext()).step).toBe(4);
    expect(rejectionFor(`UPDATE "public$conformance_notes" SET title = 'x'`, physicalContext()).step).toBe(4);
    expect(rejectionFor(`DELETE FROM "public$conformance_notes"`, physicalContext()).step).toBe(4);
    expect(rejectionFor(`INSERT INTO "public$conformance_notes" (id) VALUES ('x')`, physicalContext()).step).toBe(4);
  });

  it('附加库限定叠在物理表名上仍然落第 4 步', () => {
    // SQLite `ATTACH` 之后的 `main."public$conformance_notes"`：点号与 `$` 同时出现。
    expect(rejectionFor(`UPDATE main."public$conformance_notes" SET title = 'x'`, physicalContext()).step).toBe(4);
  });

  it('物理表名上的 untracked 列集照样在第 5 步放行', () => {
    // 别名要能被 `untrackedFieldsOf()` 认出来，否则列级豁免在 5 个后端上不可达——
    // 一条只改审计时间的簿记写会被拦成 `commit_capability_mismatch`。
    expect(allowanceFor(`UPDATE "public$conformance_notes" SET "updatedAt" = now()`, physicalContext())).toEqual({
      kind: 'allow',
      step: 5,
      reason: 'untracked_only'
    });
  });

  it('QueryCache 的物理表名仍然是域外', () => {
    expect(allowanceFor(`UPDATE "public$conformance_caches" SET label = 'x'`, physicalContext()).reason).toBe(
      'out_of_domain'
    );
  });

  it('别名不会把 `$` 变成一把钝刀：FTS 影子表与同前缀表都不受影响', () => {
    // `_fts_<物理表名>`（rxdb-plugin-search）按 `$` 切一刀正好得到 `conformance_notes`。
    // 登记别名而不是切分隔符，正是为了让这条继续落 `out_of_domain`。
    expect(allowanceFor(`INSERT INTO "_fts_public$conformance_notes" (rowid) VALUES (1)`, physicalContext())).toEqual({
      kind: 'allow',
      step: 5,
      reason: 'out_of_domain'
    });
    expect(allowanceFor(`UPDATE "other$conformance_notes" SET title = 'x'`, physicalContext()).reason).toBe(
      'out_of_domain'
    );
  });
});

describe('注释剥离：未闭合的块注释不能把判定拖成二次方（CWE-1333）', () => {
  /**
   * 未闭合 `/*` 的重复；`sql` 参数是库的公开入口，长度不由判定决定。
   *
   * @param repeats - `a/*` 重复多少次
   * @returns 一条永远不会闭合注释的语句
   */
  const unterminatedComments = (repeats: number): string => `/*${'a/*'.repeat(repeats)}`;

  it('十万次重复也在毫秒量级判完', () => {
    // 判定跑在**每一次** raw 调用上。剥注释的正则一旦在未闭合的 `/*` 上退化成
    // 「从每个 `/*` 重扫到串尾」，一条 300KB 的语句就能把判定本身变成拒绝服务的入口：
    // 二次方下这条要跑数秒，线性下是亚毫秒。留三个量级的余量，免得成为看机器脸色的断言。
    const sql = unterminatedComments(100_000);
    const started = performance.now();
    judgeRawWrite(sql, context());
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('未闭合的块注释一路吃到串尾——与 SQLite 对注释的读法一致', () => {
    // SQLite 明确允许块注释以输入结束收尾，PG 则直接把这条判为语法错。两种方言下
    // `/*` 之后的内容都不会真的写进业务表，所以剥掉它不开新的绕过口子。
    expect(allowanceFor("SELECT 1 /* UPDATE post SET title = 'x'").reason).toBe('not_a_write');
  });

  it('闭合的块注释只吃到 `*/`，后面的写照样被拦', () => {
    // 与上一条互为边界：真把「`/*` 之后一律不看」写进实现的话，这条会静默放行。
    expect(rejectionFor("/* c */ UPDATE post SET title = 'x'").step).toBe(4);
    expect(rejectionFor("UPDATE /* c */ post SET title = 'x'").step).toBe(4);
  });
});

describe('词法归一化是单趟的：注释与字面量谁先出现谁先吃', () => {
  it('字面量里的 `--` 不开行注释——被它「注掉」的那条写照样落第 4 步', () => {
    // 剥注释与掩字面量分两趟跑时，无论哪一趟排在前面，都有一侧会被对方的定界符骗过去。
    // 注释在前：`'--'` 这个**值**把它后面的一切注掉，于是一条完整的写语句可以整条藏在
    // 一个无害语句的字符串参数后面——而参数值正是调用方最容易控制的位置。
    expect(rejectionFor("UPDATE app_setting SET value = '--'; UPDATE post SET title = 'x'").step).toBe(4);
    expect(rejectionFor("UPDATE post SET remote_id = '-- x', title = 'y'").step).toBe(4);
  });

  it('字面量里的 `/*` 不开块注释——藏在两个字面量之间的被跟踪列赋值照样落第 4 步', () => {
    // 块注释版更隐蔽：`/*` 与 `*/` 分别落在两个字面量里，中间那段 `title = …` 被整段吞掉，
    // 剩下的列集恰好还是一个良构的、只含 untracked 列的子集——第 5 步于是给出 `untracked_only`。
    // 「吞完还留下良构列集」是它能真绕过去、而不是被列集解析的 fail-closed 拦下的唯一原因。
    expect(rejectionFor("UPDATE post SET remote_id = '/*', title = 'x', synced_at = '*/'").step).toBe(4);
    expect(rejectionFor("UPDATE post SET remote_id = '/*', title = 'x' -- */").step).toBe(4);
  });

  it('注释里的撇号不开字面量——注释后面那条写照样落第 4 步', () => {
    // 与上两条互为边界：把「先掩字面量、再剥注释」当成修法的话，这两条会翻过来漏。
    // `don't` 的撇号开出一个假字面量，一路吃到下一条语句里真正的引号为止，`UPDATE post` 随之消失。
    expect(rejectionFor("SELECT 1; -- don't\nUPDATE post SET title = 'x'").step).toBe(4);
    expect(rejectionFor("/* don't */ UPDATE post SET title = 'x'").step).toBe(4);
  });
});

describe('dollar-quoted 字符串：PG 的第五类定界符', () => {
  it('`$$ … $$` 里的 `WHERE` 不终止 SET 子句——藏在它后面的被跟踪列赋值落第 4 步', () => {
    // 这是「五类定界符少认一类」的可执行后果，不是理论缺口：内存 PGlite 上，下面这条把
    // `title` 真改成了 `changed`，而少认 `$$` 的判定读出的列集只有 `remote_id`，于是第 5 步
    // 给出 `untracked_only`——门禁以为只写了簿记列，工作树没有任何对应捕获单元。
    // 词法层少认一类定界符，危害与少认注释完全同形：字面量内部的结构字被当成结构。
    expect(
      rejectionFor(`UPDATE "public"."post" SET "remote_id" = $$ WHERE $$, title = 'changed' WHERE id = 'a'`).step
    ).toBe(4);
  });

  it('带标签的形式一样认——标签是 PG 的标识符，可以是非 ASCII', () => {
    // 只认无标签的 `$$` 等于把同一个洞留给 `$tag$`：标签形态正是为「正文里含 `$$`」准备的，
    // 也就是最可能出现在手写 SQL 里的那一种。
    expect(rejectionFor(`UPDATE post SET remote_id = $tag$ WHERE $tag$, title = 'changed' WHERE id = 'a'`).step).toBe(
      4
    );
    expect(rejectionFor(`UPDATE post SET remote_id = $标签$ WHERE $标签$, title = 'x'`).step).toBe(4);
  });

  it('字面量内部的分号不切语句、注释符不开注释、撇号不开字面量', () => {
    // 与 `'…'` 同一条口径（见上一组用例）：认出定界符之后，正文里的一切结构字都只是字符。
    // 反过来写松的话，这三条都会变成**误拒**——一条只更新簿记列的合法写被拦下。
    expect(allowanceFor(`UPDATE post SET remote_id = $$a; UPDATE post SET title = 'x'$$ WHERE id = 'a'`).reason).toBe(
      'untracked_only'
    );
    expect(allowanceFor(`UPDATE post SET remote_id = $$ -- don't /* $$ WHERE id = 'a'`).reason).toBe('untracked_only');
  });

  it('不闭合的 dollar-quote 不吃掉它后面的写（fail-closed）', () => {
    // 与未闭合的块注释**刻意不同**：那一类吃到串尾是安全的（SQLite 允许、PG 判语法错，两种读法下
    // 后面那截都不会写进业务表）。这一类不行——`$$` 在 SQLite 里根本不是定界符，吃到串尾就等于
    // 把一条真能执行的写从视野里抹掉。所以认不出配对时按「这不是定界符」处理，正文继续参与判定。
    expect(rejectionFor(`UPDATE post SET remote_id = $$, title = 'x'`).step).toBe(4);
    expect(rejectionFor(`UPDATE post SET remote_id = $tag$, title = 'x'`).step).toBe(4);
  });

  it('参数占位符不是 dollar-quote——PG 的 `$1` 与 SQLite 的 `$name` 照旧', () => {
    // 这一条是上面那条 fail-closed 规则的正面：六个后端里五个是 SQLite 家族，`$name` 是它的
    // 命名参数，`$1` 是 PG 的位置参数。把落单的 `$` 当成定界符起点会让**每一条带参数的 raw 写**
    // 开始误判——判定跑在每一次 raw 调用上，这种误判比漏判更早被用户撞上。
    expect(allowanceFor(`UPDATE post SET remote_id = $1 WHERE id = $2`).reason).toBe('untracked_only');
    expect(allowanceFor(`UPDATE post SET remote_id = $remote, synced_at = $when WHERE id = $id`).reason).toBe(
      'untracked_only'
    );
    expect(rejectionFor(`UPDATE post SET title = $1 WHERE id = $2`).step).toBe(4);
  });

  it('谁先出现谁先吃：字面量里的 `$$` 不开 dollar-quote', () => {
    // 与「字面量里的 `/*` 不开块注释」互为边界。开了的话，两个字面量里的 `$$` 之间那段
    // `title = 'x'` 会被整段吞掉，剩下的列集恰好还是一个只含 untracked 列的良构子集——
    // 也就是第 5 步会放行的那一种形状。
    expect(rejectionFor(`UPDATE post SET remote_id = '$$', title = 'x', synced_at = '$$'`).step).toBe(4);
    expect(rejectionFor(`UPDATE post SET remote_id = 1 /* $$ */, title = 'x', synced_at = 2 /* $$ */`).step).toBe(4);
  });

  it('十万个配不上对的标签也在毫秒量级判完（CWE-1333）', () => {
    // 每个标签只出现一次，于是每一次配对都必然落空。用 `indexOf` 逐个从当前位置扫到串尾的写法，
    // 这条输入会退化成二次方——与未闭合块注释那条是同一类退化，只是换了个定界符。
    // 线性的做法是先一趟把全部 `$tag$` 记号按标签建索引，配对变成一次指针前进。
    const sql = Array.from({ length: 100_000 }, (_unused, index) => `$t${index}$`).join(' ');
    const started = performance.now();
    judgeRawWrite(sql, context());
    expect(performance.now() - started).toBeLessThan(500);
  });
});
