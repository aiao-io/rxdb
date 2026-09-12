/**
 * @fileoverview QueryCache 远端行列契约的跨后端套件（US-022 / US-024 AC#5）。
 *
 * @remarks
 * 每个 QueryCache 本地行缓存后端（sqlite-core family、PGlite）都在落地前判一次
 * 「远端这一行带齐必填列了吗」。本套件锁的是**两侧必须一致**的那部分：
 * 哪些列可以省略、错误的 `name` 与消息骨架、整批拒绝。
 *
 * **不**锁两侧故意不同的那两条 —— uuid 主键（sqlite 的 DDL 给
 * `DEFAULT (lower(hex(randomblob(16))))`，PGlite 不给任何默认值）与 `SET NULL` 外键列
 * （sqlite 不发 NOT NULL，PGlite 照发）。判据来自各自的建表 DDL，照抄另一侧只会
 * 让「过了校验的行」在 INSERT 时被数据库拒掉。那两条各自在自己包的用例里锁死。
 *
 * @example
 * ```ts
 * // packages/rxdb-adapter-<x>/src/__tests__/query-cache-row-contract.spec.ts
 * import { runQueryCacheRowContractSuite } from '@aiao/rxdb-test/query-cache-contract';
 *
 * runQueryCacheRowContractSuite({
 *   name: 'pglite',
 *   requiredQueryCacheColumns,
 *   assertQueryCacheRowContract,
 *   ErrorClass: RxDBQueryCacheRowContractError
 * });
 * ```
 */
import { getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { QcContractBlob, QcContractMapped, QcContractMember, QcContractRecipe, QcContractTeam } from './fixtures.js';
import type { QueryCacheRowContractImpl } from './types.js';

/** 一行齐全的 `QcContractRecipe` 远端行；`id` 显式带上 —— 它在两侧的必填判定不同。 */
const fullRecipeRow = (id: string): Record<string, unknown> => ({
  id,
  title: `t-${id}`,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z'
});

/**
 * 运行 QueryCache 行契约的跨后端套件。
 *
 * @param impl - 被测后端的契约实现接入点
 */
export function runQueryCacheRowContractSuite(impl: QueryCacheRowContractImpl): void {
  const { name, requiredQueryCacheColumns, assertQueryCacheRowContract, ErrorClass } = impl;

  describe(`QueryCache 远端行列契约 —— 跨后端共同规则 (${name})`, () => {
    describe('requiredQueryCacheColumns', () => {
      it('无默认值的非空列必填；可空列与带字面量 default 的列可省略', () => {
        const required = requiredQueryCacheColumns(getEntityMetadata(QcContractRecipe));

        expect(required.has('title')).toBe(true);
        // 可空 → 建表不发 NOT NULL
        expect(required.has('tag')).toBe(false);
        // 字面量 default → 进 DDL 的 DEFAULT 子句
        expect(required.has('status')).toBe(false);
        expect(required.has('createdBy')).toBe(false);
        expect(required.has('updatedBy')).toBe(false);
      });

      it('EntityBase 的 createdAt / updatedAt 必填 —— 函数型 default 一个字都不进 DDL', () => {
        // `default: () => new Date()` 是**仓储层**的东西，而 QueryCache 的落地是绕开仓储的
        // 裸 SQL 写。列建成 NOT NULL、远端又不带，INSERT 必然被拒 —— 正是本契约的病灶。
        const required = requiredQueryCacheColumns(getEntityMetadata(QcContractRecipe));

        expect(required.has('createdAt')).toBe(true);
        expect(required.has('updatedAt')).toBe(true);
      });

      it('值给的是物理列名', () => {
        const required = requiredQueryCacheColumns(getEntityMetadata(QcContractMapped));

        expect(required.get('authorName')).toBe('author_name');
      });

      it('binary 列即使写了字面量 default 也仍是必填列', () => {
        // 两侧建表都对 binary 明确跳过 DEFAULT 子句，列上只剩光秃秃的 NOT NULL。
        const required = requiredQueryCacheColumns(getEntityMetadata(QcContractBlob));

        expect(required.has('payload')).toBe(true);
      });

      it('非空的多对一外键列必填，可空的不必填', () => {
        const required = requiredQueryCacheColumns(getEntityMetadata(QcContractMember));

        expect(required.has('owner')).toBe(true);
        expect(required.get('owner')).toBe('owner_id');
        expect(required.has('backup')).toBe(false);
      });

      it('被引用端自己的必填列不受关系影响', () => {
        const required = requiredQueryCacheColumns(getEntityMetadata(QcContractTeam));

        expect(required.has('teamName')).toBe(true);
      });
    });

    describe('assertQueryCacheRowContract', () => {
      const metadata = getEntityMetadata(QcContractRecipe);

      it('空批次不做任何判定', () => {
        expect(() => assertQueryCacheRowContract('QcContractRecipe', [], metadata)).not.toThrow();
      });

      it('列集完整时逐行放行', () => {
        const rows = [fullRecipeRow('r1'), fullRecipeRow('r2')];

        expect(() => assertQueryCacheRowContract('QcContractRecipe', rows, metadata)).not.toThrow();
      });

      it('远端多带本地没有的列不由本契约报错', () => {
        // 未知键有各后端自己的白名单判定（`assertKnownKeys` / `columnNames` 映射），
        // 本契约只判「缺不缺」，不越界。
        const rows = [{ ...fullRecipeRow('r1'), extraneous: 'x' }];

        expect(() => assertQueryCacheRowContract('QcContractRecipe', rows, metadata)).not.toThrow();
      });

      it('行带的是物理列名时算带齐，不误报', () => {
        const mappedMetadata = getEntityMetadata(QcContractMapped);
        const rows = [
          {
            id: 'm1',
            author_name: '列名写法',
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-02T00:00:00.000Z'
          }
        ];

        expect(() => assertQueryCacheRowContract('QcContractMapped', rows, mappedMetadata)).not.toThrow();
      });

      it.each(['owner', 'ownerId', 'owner_id'])('外键列的三种写法都算带齐，不误报：%s', key => {
        // 一个外键列有三种等价写法：关系名 `owner`、外键别名 `ownerId`、物理列名 `owner_id`。
        // 两侧的落地路径都把三种翻译到同一个物理列（共用各自包里的
        // `queryCacheForeignKeyColumns`），契约少认哪一种，那种写法的远端行就会被判成
        // 「缺 owner」—— 而它原本能一字不差地落进 `owner_id`。拒掉能落的行，比不判还糟。
        const memberMetadata = getEntityMetadata(QcContractMember);
        const rows = [
          {
            id: 'mb1',
            nickName: '三种写法',
            [key]: 'tm1',
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-02T00:00:00.000Z'
          }
        ];

        expect(() => assertQueryCacheRowContract('QcContractMember', rows, memberMetadata)).not.toThrow();
      });

      it('缺 createdAt 时抛契约错误，而不是让数据库报约束失败', () => {
        const row = fullRecipeRow('r1');
        delete row['createdAt'];

        expect(() => assertQueryCacheRowContract('QcContractRecipe', [row], metadata)).toThrow(ErrorClass);
      });

      it('错误的 name 两侧逐字一致', () => {
        // 两个包各有自己的错误类（pglite 不依赖 sqlite-core），靠 `name` 让调用方
        // 不分后端地识别「远端给的数据不对」这一类失败。
        const row = fullRecipeRow('r1');
        delete row['createdAt'];

        try {
          assertQueryCacheRowContract('QcContractRecipe', [row], metadata);
          expect.unreachable('应当抛出契约错误');
        } catch (error) {
          expect((error as Error).name).toBe('RxDBQueryCacheRowContractError');
        }
      });

      it('整条消息两侧逐字一致 —— 点名实体、缺失列、整批未落地、为何不补默认值、文档指路', () => {
        // 钉**整条**而不是挑几个片段：片段断言只能证明「这几句还在」，两侧的措辞、标点、
        // 换行、缩进各漂一点它都照过 —— 而这条消息的全部价值就是读者不必因为换了个本地行
        // 缓存后端就重学一套诊断。逐字比对让任何单侧改动直接变红。
        //
        // 用「只缺必填列、只有一行」这个形状才能两侧逐字可比：sqlite-core 还多一条
        // 「批内异构」判据（成因是它的列清单取自 `data[0]`，PGlite 按列集分组，结构上没这个病），
        // 那一栏只在多行异构时才出现；单行时两侧的 `describeRow` 拼出来的是同一串。
        const row = fullRecipeRow('r1');
        delete row['createdAt'];

        let message = '';
        try {
          assertQueryCacheRowContract('QcContractRecipe', [row], metadata);
          expect.unreachable('应当抛出契约错误');
        } catch (error) {
          message = (error as Error).message;
        }

        expect(message).toBe(
          [
            'QueryCache 落地被拒：实体 "QcContractRecipe" 的远端行不满足本地表的列契约，' +
              '本批 1 行中 1 行不合格，**一行都没有落地**。',
            '  · 第 1 行（id="r1"）缺 createdAt —— 本地表把它建成 NOT NULL 且无 SQL 默认值',
            '远端行必须带齐本地表的全部非空列，含 EntityBase 的 createdAt / updatedAt。',
            '实体上的 default 只在仓储写入路径生效，QueryCache 的落地是绕开仓储的裸 SQL，不经过它；' +
              '这里也不会就地补一个 —— 补出来的是本机拉取的时刻而非记录创建的时刻，跨设备拉同一行会得到不同的值。',
            '契约与示例见 website/docs/collaboration/sync.md 的 QueryCache 一节。'
          ].join('\n')
        );
      });

      it('缺多列时一次全部列出，不是报一个改一个', () => {
        const row = fullRecipeRow('r1');
        delete row['createdAt'];
        delete row['title'];

        let message = '';
        try {
          assertQueryCacheRowContract('QcContractRecipe', [row], metadata);
        } catch (error) {
          message = (error as Error).message;
        }

        expect(message).toContain('createdAt');
        expect(message).toContain('title');
      });

      it('同批一行完整、一行缺列时整批拒绝，完整的那行也不落地', () => {
        const broken = fullRecipeRow('r2');
        delete broken['updatedAt'];
        const rows = [fullRecipeRow('r1'), broken];

        let message = '';
        try {
          assertQueryCacheRowContract('QcContractRecipe', rows, metadata);
          expect.unreachable('应当抛出契约错误');
        } catch (error) {
          message = (error as Error).message;
        }

        // 抛错本身就是整批拒绝：调用方在生成任何 SQL 之前就被拦下
        expect(message).toContain('本批 2 行中 1 行不合格');
        expect(message).toContain('一行都没有落地');
        expect(message).toContain('id="r2"');
      });
    });
  });
}
