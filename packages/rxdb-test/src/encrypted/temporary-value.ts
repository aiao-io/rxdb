/**
 * 把 `temporaryValue` 临时写入某个位置，跑完 `verify` 后无条件还原为原值。
 *
 * @remarks
 * 两条容易踩空的边界，都由本实现显式承担：
 *
 * - **篡改写入必须纳入还原范围（RXT-021）**。`write(temporaryValue)` 可能「先落库、
 *   再因响应解析或连接中断 reject」。若它留在 try 之外，rejection 会直接冒泡而跳过还原，
 *   篡改后的密文永久留在库里污染后续用例。
 * - **还原失败不得吞掉验证失败（RXT-022）**。两者同时失败时，`AggregateError.errors`
 *   按 `[验证错误, 还原错误]` 保留全部原因，`cause` 指向验证错误（它才是被测契约，
 *   例如加密套件断言的 `auth_failure`）。
 *
 * 还原写入刻意不放在 `finally` 里：`finally` 中 throw 会丢弃 try 块的完成状态
 * （`no-unsafe-finally`），无法表达「两个失败都要保留」。这里把两次写入的结果各自
 * 收进变量，在所有 catch 块之外统一裁决。
 */
export async function withTemporaryValue<T, R>(
  read: () => Promise<T>,
  write: (value: T) => Promise<void>,
  temporaryValue: T,
  verify: () => Promise<R>
): Promise<R> {
  const originalValue = await read();

  let outcome: { ok: true; value: R } | { ok: false; error: unknown };
  try {
    await write(temporaryValue);
    outcome = { ok: true, value: await verify() };
  } catch (error) {
    outcome = { ok: false, error };
  }

  let restoreFailure: { error: unknown } | undefined;
  try {
    await write(originalValue);
  } catch (error) {
    restoreFailure = { error };
  }

  if (restoreFailure && !outcome.ok) {
    throw new AggregateError(
      [outcome.error, restoreFailure.error],
      'temporary value restore failed after verification',
      { cause: outcome.error }
    );
  }
  if (restoreFailure) throw restoreFailure.error;
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
