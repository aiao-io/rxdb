/** 用例侧给夹具调用加的时限，浏览器与桌面两套用例共用。 */

/**
 * 夹具单次调用的上限（毫秒）。
 *
 * @remarks
 * Playwright 的 expect 超时只管 web-first 断言与 `expect.poll`，管不到普通的 await，`expect(promise).resolves`
 * 同样要等到测试超时：夹具里某一步永不兑现时，用例会烧满测试超时、每次重试再烧一遍，报错也指不出卡在哪一步。
 * 取值大于夹具里最长的合法等待——浏览器夹具页的 hello 超时是 30 秒，连不上时让它先报出更具体的原因。
 */
export const CALL_DEADLINE_MS = 40_000;

/** 等 `promise` 兑现；超过 `ms` 仍未兑现即以点名 `what` 的错误拒绝。 */
export const withinDeadline = <T>(promise: Promise<T>, what: string, ms = CALL_DEADLINE_MS): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not settle within ${ms} ms`)), ms);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
};
