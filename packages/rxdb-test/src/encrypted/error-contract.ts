/**
 * @fileoverview 加密契约套件的错误断言辅助（RXT-027）。
 *
 * 各套件此前一律只断言 `rejects.toMatchObject({ code })`。那样写有三个漏洞：
 * 普通对象 `{ code: 'locked' }` 能通过、错误 class 漂移能通过、`message` 空掉也能通过。
 *
 * 权威的跨 adapter 契约是「`instanceof Error` + 稳定 `name` + `code` + 非空 `message`」。
 * 这里不引入 `@aiao/rxdb-adapter-encrypted` 的错误类做具体类断言：
 * `@aiao/rxdb-test` 刻意不依赖具体 adapter 包（见 `types.ts`），把可选加密错误下沉核心会污染
 * `@aiao/rxdb`，由每个 factory 重复注入同一组类也不增加有效覆盖。
 * `name` 由 `EncryptedError` 基类以 `new.target.name` 写入并被文档标为稳定公开 API，
 * 因而足以作为跨包的 class 身份契约。
 */
import { expect } from 'vitest';

/**
 * `code` → 抛出它的具体错误类名。
 *
 * 映射写在**一处**：调用点只报 `code`，类名由这里推出来 ——
 * 否则每个断言都得自己把两者配对，配错了没人发现。
 */
const CODE_TO_ERROR_NAME: Readonly<Record<string, string>> = {
  encrypted_pk_forbidden: 'EncryptedConfigurationError',
  encrypted_fk_forbidden: 'EncryptedConfigurationError',
  encrypted_index_forbidden: 'EncryptedConfigurationError',
  encrypted_unique_forbidden: 'EncryptedConfigurationError',
  encrypted_sortable_forbidden: 'EncryptedConfigurationError',
  encrypted_computed_forbidden: 'EncryptedConfigurationError',
  encrypted_fts_forbidden: 'EncryptedConfigurationError',
  unsupported_kdf: 'EncryptedConfigurationError',
  invalid_key: 'EncryptedConfigurationError',
  invalid_key_bytes: 'EncryptedConfigurationError',
  no_encrypted_columns: 'EncryptedConfigurationError',
  keyring_singleton_conflict: 'EncryptedConfigurationError',
  locked: 'EncryptedLockedError',
  verifier_mismatch: 'EncryptedUnlockError',
  key_provider_failed: 'EncryptedUnlockError',
  unlock_aborted_by_lock: 'EncryptedUnlockError',
  malformed_envelope: 'EncryptedDecryptError',
  unsupported_version: 'EncryptedDecryptError',
  unsupported_algorithm: 'EncryptedDecryptError',
  unknown_kid: 'EncryptedDecryptError',
  legacy_envelope_forbidden: 'EncryptedDecryptError',
  auth_failure: 'EncryptedDecryptError',
  where_on_encrypted: 'EncryptedQueryError',
  order_on_encrypted: 'EncryptedQueryError',
  group_on_encrypted: 'EncryptedQueryError',
  projection_on_encrypted: 'EncryptedQueryError'
};

/** 对已捕获的值断言完整的错误契约。 */
export function expectEncryptedError(caught: unknown, code: string): void {
  const expectedName = CODE_TO_ERROR_NAME[code];
  // 未登记的 code 说明 `errors.ts` 的联合类型变了而这张表没跟上 —— 直接失败，
  // 而不是悄悄退化成「只比 code」。
  expect(expectedName, `code "${code}" is not registered in CODE_TO_ERROR_NAME`).toBeDefined();
  expect(caught).toBeInstanceOf(Error);
  expect(caught).toMatchObject({ name: expectedName, code });
  expect((caught as Error).message.length).toBeGreaterThan(0);
}

/**
 * 断言 `run()` 以指定 `code` 对应的加密错误拒绝。
 *
 * 不用 `rejects.toMatchObject`：那条链子在被测调用**成功 resolve** 时报的是
 * 「promise resolved …」，但更要紧的是它**验不了 `instanceof`**。
 */
export async function expectEncryptedRejection(run: () => Promise<unknown>, code: string): Promise<void> {
  const marker = Symbol('resolved');
  let caught: unknown = marker;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected rejection with code "${code}" but the call resolved`).not.toBe(marker);
  expectEncryptedError(caught, code);
}

/** {@link expectEncryptedRejection} 的同步版本。 */
export function expectEncryptedThrow(run: () => unknown, code: string): void {
  const marker = Symbol('returned');
  let caught: unknown = marker;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected throw with code "${code}" but the call returned`).not.toBe(marker);
  expectEncryptedError(caught, code);
}
