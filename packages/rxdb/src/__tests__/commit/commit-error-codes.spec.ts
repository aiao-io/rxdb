/**
 * @fileoverview T021 红测试：跨故事共享的提交错误码常量。
 *
 * @remarks
 * 契约见 `specs/001-working-tree-commits/contracts/core-api.md` §7，以及 spec.md 中
 * 逐条点名该码的验收场景 / FR（见各用例内注释）。
 *
 * 一份只有常量的模块值不值得写测试？这里值得，理由是三条**编译期抓不到**的漂移：
 *
 * 1. **码集会被悄悄扩张**。八个码分属四个故事，后续任何一个故事都可能顺手加一个
 *    契约里没有的码。加了照样编译、照样跑绿，只有在别人对着 core-api.md §7 做审计时
 *    才会发现契约与实现对不上。把清单钉死，加码的人必须同时改测试与契约。
 * 2. **值会与键漂开**。这些字符串会进日志、进错误上报、进跨 realm 的判别分支，
 *    是**对外可见的常量**；`commit_graph_corupted` 这种拼写错误不会有任何一处编译失败。
 * 3. **`benchmark_environment_mismatch` 会被"补"进来**。它出现在 core-api.md §7 的同一张表里，
 *    任何一个照表补全的人都会加它——但它是 benchmark 跑分器的结论，不是数据库命令的错误
 *    （见 benchmark-report.md）。把它钉在排除位上，比在 TSDoc 里写一句注意事项可靠。
 */

import { describe, expect, it } from 'vitest';
import { COMMIT_ERROR_CODES, CommitErrorCode, isCommitErrorCode } from '../../commit/commit-error-codes.js';
import { RxDBMixedVersionedCacheTransactionError } from '../../RxDBError.js';

describe('提交错误码', () => {
  it('码集恰好是契约 core-api.md §7 与 FR 点名的八条，不多不少', () => {
    expect([...COMMIT_ERROR_CODES]).toEqual([
      'commit_capability_disabled',
      'commit_capability_mismatch',
      'commit_graph_corrupted',
      'ambiguous_active_branch',
      'no_active_branch',
      'branch_not_materializable',
      'branch_not_materialized',
      'mixed_versioned_cache_transaction'
    ]);
  });

  it('每个成员的值与键逐字相同', () => {
    for (const [key, value] of Object.entries(CommitErrorCode)) {
      expect(value).toBe(key);
    }
  });

  it('CommitErrorCode 的成员集与 COMMIT_ERROR_CODES 互为全集', () => {
    expect(new Set(Object.values(CommitErrorCode))).toEqual(new Set(COMMIT_ERROR_CODES));
    expect(COMMIT_ERROR_CODES).toHaveLength(Object.keys(CommitErrorCode).length);
  });

  it('benchmark_environment_mismatch 被排除在外', () => {
    // core-api.md §7 与本码集共处一张表，但它是 benchmark 跑分器的结论，
    // 不是数据库命令的错误——照表补全会把它加进来，所以钉死。
    expect(isCommitErrorCode('benchmark_environment_mismatch')).toBe(false);
  });

  it('isCommitErrorCode 认全部八条，拒未登记字符串与非字符串', () => {
    for (const code of COMMIT_ERROR_CODES) {
      expect(isCommitErrorCode(code)).toBe(true);
    }
    expect(isCommitErrorCode('commit_conflict')).toBe(false);
    expect(isCommitErrorCode('stale_active_branch')).toBe(false);
    expect(isCommitErrorCode(undefined)).toBe(false);
    expect(isCommitErrorCode(null)).toBe(false);
    expect(isCommitErrorCode(7)).toBe(false);
  });

  it('既有的 RxDBMixedVersionedCacheTransactionError 取用同一个常量，而不是自己那份字面量', () => {
    // 该类早于本模块存在，`code` 是硬写的字符串字面量。两份真相里任何一份被改，
    // 另一份都不会报错——而这个码是 FR-046 指定的跨故事契约。
    const error = new RxDBMixedVersionedCacheTransactionError(['CacheEntity'], ['VersionedEntity']);
    expect(error.code).toBe(CommitErrorCode.mixed_versioned_cache_transaction);
  });
});
