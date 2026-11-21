/**
 * 库文件被别的标签页的连接占着时的重试间隔（毫秒），合计约 7 秒，用完就把最后一次的错误原样抛出。
 *
 * 同一个来源的多个标签页各持一条到 OPFS 里同一个库文件的连接，靠 OPFSCoopSyncVFS 的协议轮流持有文件的同步访问句柄：
 * 谁要用就经 BroadcastChannel 请持有者放手。持有者的标签页刚被刷新或关掉时，它的 Web Lock 随页面销毁已经放开，
 * 而它的工作线程里那个句柄要稍后才真正关掉——这段空档里别人拿锁成功却建不出句柄
 * （`createSyncAccessHandle` 报 `NoModificationAllowedError`），语句就以 `database is locked`（SQLITE_BUSY）或
 * 句柄错误失败。空档通常不到一秒；三个标签页反复刷新时实测会撞上，一页的启动查询或另一页的后台读因此报错。
 */
export const LOCK_RETRY_DELAYS: readonly number[] = [50, 100, 200, 400, 800, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000];

const CONTENTION =
  /database is locked|SQLITE_BUSY|createSyncAccessHandle|NoModificationAllowedError|Access Handles? cannot be created/i;

/** 沿 `cause` 链最多看几层：适配器把底层错误包了一层，浏览器抛的 DOMException 在里面。 */
const CAUSE_DEPTH = 3;

/**
 * 这个错误是不是「库文件暂时被别的连接占着」：SQLITE_BUSY，或同步访问句柄建不出来（按名字与措辞认，
 * 也看 `cause` 链：Safari 的措辞与 Chromium 不同，但名字都是 `NoModificationAllowedError`）。其余错误（约束、语法…）都不算。
 */
export function isLockContention(error: unknown, depth = 0): boolean {
  if (!(error instanceof Error)) return false;
  if (CONTENTION.test(error.message) || CONTENTION.test(error.name)) return true;
  return depth < CAUSE_DEPTH && isLockContention(error.cause, depth + 1);
}

/**
 * 碰上「库文件暂时被别的连接占着」就按 `delays` 退避后重试，拿到之后返回结果；别的错误立刻抛出；
 * 重试用完仍然占着，把最后一次的错误原样抛出，不无限等下去、也不悄悄当成功。
 *
 * 这种失败发生在语句拿文件锁的那一刻，语句还没有执行任何东西，所以重试是安全的（拿到锁之后的事务里不会再出这种错）。
 *
 * @param run 要执行的一次尝试
 * @param delays 每次重试之前等待的毫秒数；长度就是最多重试几次
 */
export async function retryOnLockContention<T>(
  run: () => Promise<T>,
  delays: readonly number[] = LOCK_RETRY_DELAYS
): Promise<T> {
  for (const delay of delays) {
    try {
      return await run();
    } catch (error) {
      if (!isLockContention(error)) throw error;
    }
    await new Promise<void>(resolve => setTimeout(resolve, delay));
  }
  return run();
}
