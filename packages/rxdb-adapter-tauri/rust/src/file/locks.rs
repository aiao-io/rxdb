//! 跨上下文锁的仲裁表，`packages/rxdb-adapter-electron/src/electron-file-host.ts` 的
//! `queueOf` / `canGrant` / `pump` / `dropWaiters` 在 Rust 侧的对应物。
//!
//! **这里只有数据结构，没有阻塞、没有 I/O。** TS 侧靠 promise 队列，在事件循环上天然串行；
//! Rust 侧的等待发生在 [`super::FileHost`] 的 `Condvar` 上，本模块只负责回答「谁该拿到锁」。
//! 分开的好处是这套仲裁逻辑可以同步地单元测试——多线程测试里 FIFO 的顺序断言本身就不稳。
//!
//! 与 TS 侧的两处有意分歧，都写在各自的函数注释里：
//! 1. [`LockTable::drop_session`] 先拒排队、后放持有（TS 侧相反）；
//! 2. 会话关闭时把**尚未被取走**的授予结果改判为 `session_closed`。

use std::collections::{HashMap, VecDeque};

use crate::error::{ErrorCode, HostError, HostResult};

use super::protocol::LockMode;

/// 一次申请的最终结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LockOutcome {
    /// 锁已授予，`lock_id` 可以拿去用。
    Granted,
    /// 申请被拒；调用方必须收到错误，不能一直悬着。
    Denied(HostError),
}

#[derive(Debug)]
struct Waiter {
    lock_id: String,
    session_id: String,
    mode: LockMode,
}

#[derive(Debug, Default)]
struct LockQueue {
    held: HashMap<String, LockMode>,
    waiting: VecDeque<Waiter>,
}

#[derive(Debug)]
struct GrantedLock {
    name: String,
    session_id: String,
}

/// 按锁名分组的等待队列 + 已授予登记表。
///
/// 持有者记在**表里**而不是会话结构里：会话关闭与授予可能发生在两个线程上，
/// 分成两处存就会出现「表说锁还在、会话说锁没了」的中间态，那把锁从此没人释放。
#[derive(Debug, Default)]
pub struct LockTable {
    queues: HashMap<String, LockQueue>,
    granted: HashMap<String, GrantedLock>,
    outcomes: HashMap<String, LockOutcome>,
}

fn session_closed(session_id: &str) -> HostError {
    HostError::new(
        ErrorCode::SessionClosed,
        format!("file session {session_id} closed while queued"),
    )
}

fn can_grant(held: &HashMap<String, LockMode>, mode: LockMode) -> bool {
    if held.is_empty() {
        return true;
    }
    mode == LockMode::Shared && held.values().all(|held_mode| *held_mode == LockMode::Shared)
}

/// 队首能拿到锁就摘下来，否则整队停住——独占请求不会被源源不断的共享请求饿死。
fn next_grantable(queue: &mut LockQueue) -> Option<Waiter> {
    let mode = queue.waiting.front()?.mode;
    if !can_grant(&queue.held, mode) {
        return None;
    }
    queue.waiting.pop_front()
}

/// 推进一条队列，返回本轮拿到锁的 `(lock_id, session_id)`。
fn drain_grantable(queue: &mut LockQueue) -> Vec<(String, String)> {
    let mut granted = Vec::new();
    while let Some(waiter) = next_grantable(queue) {
        queue.held.insert(waiter.lock_id.clone(), waiter.mode);
        granted.push((waiter.lock_id, waiter.session_id));
    }
    granted
}

/// 从一条队列里摘掉属于该会话的等待者，返回它们的 `lock_id`。
fn take_waiters_of(queue: &mut LockQueue, session_id: &str) -> Vec<String> {
    let (leaving, staying): (VecDeque<Waiter>, VecDeque<Waiter>) = std::mem::take(&mut queue.waiting)
        .into_iter()
        .partition(|waiter| waiter.session_id == session_id);
    queue.waiting = staying;
    leaving.into_iter().map(|waiter| waiter.lock_id).collect()
}

impl LockTable {
    /// 排队申请一把锁，返回 host 签发的 `lock_id`。
    ///
    /// 立刻可授予时结果同步就绪，调用方一次 [`Self::take_outcome`] 就能拿到，不必等条件变量。
    pub fn enqueue(&mut self, name: &str, session_id: &str, mode: LockMode) -> String {
        let lock_id = uuid::Uuid::new_v4().to_string();
        self.queues.entry(name.to_string()).or_default().waiting.push_back(Waiter {
            lock_id: lock_id.clone(),
            session_id: session_id.to_string(),
            mode,
        });
        self.pump(name);
        lock_id
    }

    /// 取走一次申请的结果；结果只能被取走一次。
    ///
    /// `None` 表示仍在排队——调用方应当继续等条件变量，而不是把它当成失败。
    pub fn take_outcome(&mut self, lock_id: &str) -> Option<LockOutcome> {
        self.outcomes.remove(lock_id)
    }

    /// 某个锁名下正在排队的申请数。
    ///
    /// 仲裁本身用不到它，**多线程测试**用得到：没有它就只能靠 sleep 去猜「等待方排上队了没」，
    /// 那种测试要么必然 flaky，要么必然慢。
    pub fn queued_count(&self, name: &str) -> usize {
        self.queues.get(name).map_or(0, |queue| queue.waiting.len())
    }

    /// 释放一把锁。
    ///
    /// 会话归属由**本表**判定：renderer 递来的 `lock_id` 只是一个字符串，
    /// 不校验归属就等于让任意会话释放别人的锁。
    pub fn release(&mut self, lock_id: &str, session_id: &str) -> HostResult<()> {
        let owned = self
            .granted
            .get(lock_id)
            .is_some_and(|lock| lock.session_id == session_id);
        if !owned {
            return Err(HostError::new(
                ErrorCode::ProtocolViolation,
                format!("lock {lock_id} is not held by this session"),
            ));
        }
        if let Some(name) = self.detach(lock_id) {
            self.pump(&name);
        }
        Ok(())
    }

    /// 会话消失时回收它的全部锁。
    ///
    /// **先拒排队、后放持有**，与 TS 侧的顺序相反。TS 侧先放持有的锁，那一步的 `pump`
    /// 有可能把锁授给这个正在关闭的会话自己还排着的申请——那把锁随后不会有人释放，
    /// 同名的后续申请就永远排在它后面。先把队列里属于本会话的申请拒干净，这条路径不存在。
    pub fn drop_session(&mut self, session_id: &str) {
        let mut touched = self.deny_waiters(session_id);
        touched.extend(self.release_held(session_id));
        touched.sort_unstable();
        touched.dedup();
        for name in touched {
            self.pump(&name);
        }
    }

    fn pump(&mut self, name: &str) {
        let Some(queue) = self.queues.get_mut(name) else {
            return;
        };
        for (lock_id, session_id) in drain_grantable(queue) {
            self.granted.insert(
                lock_id.clone(),
                GrantedLock {
                    name: name.to_string(),
                    session_id,
                },
            );
            self.outcomes.insert(lock_id, LockOutcome::Granted);
        }
        self.prune(name);
    }

    /// 摘掉一把已授予的锁，返回它所在的队列名。
    fn detach(&mut self, lock_id: &str) -> Option<String> {
        let lock = self.granted.remove(lock_id)?;
        if let Some(queue) = self.queues.get_mut(&lock.name) {
            queue.held.remove(lock_id);
        }
        Some(lock.name)
    }

    /// 显式拒掉该会话排队中的申请，返回受影响的队列名。
    ///
    /// 不拒的话调用方那一侧的等待永远悬着——TS 侧的注释写的就是这句。
    fn deny_waiters(&mut self, session_id: &str) -> Vec<String> {
        let denied: Vec<(String, String)> = self
            .queues
            .iter_mut()
            .flat_map(|(name, queue)| {
                take_waiters_of(queue, session_id)
                    .into_iter()
                    .map(|lock_id| (name.clone(), lock_id))
            })
            .collect();
        let touched = denied.iter().map(|(name, _)| name.clone()).collect();
        for (_, lock_id) in denied {
            self.outcomes.insert(lock_id, LockOutcome::Denied(session_closed(session_id)));
        }
        touched
    }

    /// 释放该会话已持有的锁，返回受影响的队列名。
    fn release_held(&mut self, session_id: &str) -> Vec<String> {
        let held: Vec<String> = self
            .granted
            .iter()
            .filter(|(_, lock)| lock.session_id == session_id)
            .map(|(lock_id, _)| lock_id.clone())
            .collect();
        held.iter().filter_map(|lock_id| self.give_up(lock_id, session_id)).collect()
    }

    /// 摘掉一把锁并把**尚未被取走**的授予结果改判为会话关闭。
    ///
    /// 授予结果还在表里，说明申请线程还没拿到 `lock_id`。留着 `Granted` 会让它拿到一个
    /// 本表已经不认的 id，之后那次释放报的是「不是这个会话持有的锁」——一个与真实原因
    /// 完全无关的错误。TS 侧没有这一步（事件循环上这个窗口不存在）。
    fn give_up(&mut self, lock_id: &str, session_id: &str) -> Option<String> {
        let name = self.detach(lock_id)?;
        if self.outcomes.contains_key(lock_id) {
            self.outcomes
                .insert(lock_id.to_string(), LockOutcome::Denied(session_closed(session_id)));
        }
        Some(name)
    }

    /// 空队列随手清掉：锁名是逐文件的，长跑的宿主不清理就会按访问过的文件数无界增长。
    fn prune(&mut self, name: &str) {
        let empty = self
            .queues
            .get(name)
            .is_some_and(|queue| queue.held.is_empty() && queue.waiting.is_empty());
        if empty {
            self.queues.remove(name);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NAME: &str = "/todo/attachments";

    /// 申请一把锁并立刻看结果；`None` 表示还排着队。
    fn request(table: &mut LockTable, session: &str, mode: LockMode) -> (String, Option<LockOutcome>) {
        let lock_id = table.enqueue(NAME, session, mode);
        let outcome = table.take_outcome(&lock_id);
        (lock_id, outcome)
    }

    fn granted(outcome: Option<LockOutcome>) -> bool {
        outcome == Some(LockOutcome::Granted)
    }

    #[test]
    fn grants_an_uncontended_lock_immediately() {
        let mut table = LockTable::default();
        let (_, outcome) = request(&mut table, "a", LockMode::Exclusive);
        assert!(granted(outcome));
    }

    #[test]
    fn lets_shared_holders_in_together() {
        let mut table = LockTable::default();
        let (_, first) = request(&mut table, "a", LockMode::Shared);
        let (_, second) = request(&mut table, "b", LockMode::Shared);
        assert!(granted(first) && granted(second));
    }

    #[test]
    fn makes_an_exclusive_request_wait_for_every_shared_holder() {
        let mut table = LockTable::default();
        let (first, _) = request(&mut table, "a", LockMode::Shared);
        let (second, _) = request(&mut table, "b", LockMode::Shared);
        let (writer, outcome) = request(&mut table, "c", LockMode::Exclusive);
        assert!(outcome.is_none());

        table.release(&first, "a").unwrap();
        assert!(table.take_outcome(&writer).is_none(), "one reader still holds it");
        table.release(&second, "b").unwrap();
        assert!(granted(table.take_outcome(&writer)));
    }

    /// 队首拿不到就整队停住。少了这条，独占请求会被源源不断的共享请求无限期饿死。
    #[test]
    fn blocks_the_queue_head_so_an_exclusive_request_is_not_starved() {
        let mut table = LockTable::default();
        let (reader, _) = request(&mut table, "a", LockMode::Shared);
        let (writer, _) = request(&mut table, "b", LockMode::Exclusive);
        let (latecomer, outcome) = request(&mut table, "c", LockMode::Shared);
        assert!(outcome.is_none(), "the exclusive request is ahead of it");

        table.release(&reader, "a").unwrap();
        assert!(granted(table.take_outcome(&writer)));
        assert!(table.take_outcome(&latecomer).is_none(), "the writer holds it now");

        table.release(&writer, "b").unwrap();
        assert!(granted(table.take_outcome(&latecomer)));
    }

    /// 独占锁放开后，后面连着的一串共享申请要**一次性**全放进去。
    #[test]
    fn grants_the_whole_shared_run_once_the_exclusive_holder_leaves() {
        let mut table = LockTable::default();
        let (writer, _) = request(&mut table, "a", LockMode::Exclusive);
        let (first, _) = request(&mut table, "b", LockMode::Shared);
        let (second, _) = request(&mut table, "c", LockMode::Shared);

        table.release(&writer, "a").unwrap();
        assert!(granted(table.take_outcome(&first)));
        assert!(granted(table.take_outcome(&second)));
    }

    /// `lock_id` 只是一个字符串；不校验归属就等于让任意会话释放别人的锁。
    #[test]
    fn refuses_to_release_a_lock_another_session_holds() {
        let mut table = LockTable::default();
        let (lock_id, _) = request(&mut table, "a", LockMode::Exclusive);

        let error = table.release(&lock_id, "b").unwrap_err();
        assert_eq!(error.code, ErrorCode::ProtocolViolation);
        let error = table.release("not-a-lock", "a").unwrap_err();
        assert_eq!(error.code, ErrorCode::ProtocolViolation);

        table.release(&lock_id, "a").unwrap();
        let error = table.release(&lock_id, "a").unwrap_err();
        assert_eq!(error.code, ErrorCode::ProtocolViolation, "releasing twice is a violation");
    }

    /// 会话消失时排队中的申请必须被显式拒绝，否则调用方的等待永远悬着。
    #[test]
    fn denies_queued_requests_when_their_session_closes() {
        let mut table = LockTable::default();
        let (holder, _) = request(&mut table, "a", LockMode::Exclusive);
        let (queued, _) = request(&mut table, "b", LockMode::Exclusive);

        table.drop_session("b");
        let outcome = table.take_outcome(&queued);
        assert!(matches!(outcome, Some(LockOutcome::Denied(error)) if error.code == ErrorCode::SessionClosed));

        table.release(&holder, "a").unwrap();
    }

    #[test]
    fn hands_a_closing_sessions_locks_to_the_next_in_line() {
        let mut table = LockTable::default();
        let (_, _) = request(&mut table, "a", LockMode::Exclusive);
        let (waiting, outcome) = request(&mut table, "b", LockMode::Exclusive);
        assert!(outcome.is_none());

        table.drop_session("a");
        assert!(granted(table.take_outcome(&waiting)));
    }

    /// 关闭顺序反过来（先放持有、后拒排队）会让锁被授给正在关闭的会话自己，
    /// 那把锁随后不会有人释放，同名的后续申请永远排在它后面。
    #[test]
    fn never_grants_a_lock_to_the_session_that_is_closing() {
        let mut table = LockTable::default();
        let (held, _) = request(&mut table, "a", LockMode::Exclusive);
        let (self_queued, _) = request(&mut table, "a", LockMode::Exclusive);
        let (other, outcome) = request(&mut table, "b", LockMode::Exclusive);
        assert!(outcome.is_none());

        table.drop_session("a");
        let denied = table.take_outcome(&self_queued);
        assert!(matches!(denied, Some(LockOutcome::Denied(error)) if error.code == ErrorCode::SessionClosed));
        assert!(granted(table.take_outcome(&other)), "the lock must reach the surviving session");
        assert_eq!(table.release(&held, "a").unwrap_err().code, ErrorCode::ProtocolViolation);
    }

    /// 授予结果还没被取走就关会话：必须改判为 `session_closed`，否则申请线程会拿到一个
    /// 本表已经不认的 `lock_id`，之后那次释放报的原因与真相完全无关。
    #[test]
    fn recalls_a_grant_that_the_closing_session_never_collected() {
        let mut table = LockTable::default();
        let lock_id = table.enqueue(NAME, "a", LockMode::Exclusive);

        table.drop_session("a");
        let outcome = table.take_outcome(&lock_id);
        assert!(matches!(outcome, Some(LockOutcome::Denied(error)) if error.code == ErrorCode::SessionClosed));

        let (_, next) = request(&mut table, "b", LockMode::Exclusive);
        assert!(granted(next), "the recalled lock must not stay held");
    }

    /// 锁名是逐文件的：不清空队列，长跑的宿主会按访问过的文件数无界增长。
    #[test]
    fn forgets_queues_that_nobody_holds_or_waits_on() {
        let mut table = LockTable::default();
        let (lock_id, _) = request(&mut table, "a", LockMode::Exclusive);
        assert_eq!(table.queues.len(), 1);
        table.release(&lock_id, "a").unwrap();
        assert!(table.queues.is_empty());
    }
}
