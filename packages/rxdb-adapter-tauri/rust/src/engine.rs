//! 单个数据库连接，`packages/rxdb-adapter-electron/src/node-sqlite-engine.ts` 的 Rust 对照实现。
//!
//! **一个会话一条连接，不共享**：两个窗口若共用一条连接，它们的 `BEGIN` 块会互相穿插，
//! 事务隔离直接失效（US-210 AC#2）。各自持有连接后，跨窗口的并发交给 SQLite 自己的
//! 文件锁与写者租约处理。
//!
//! # 与 Node 版的三处有意差异
//!
//! 1. **忙等**：这里设 `PRAGMA busy_timeout`，Node 版**故意不设**。Node 版的理由是
//!    `node:sqlite` 同步接口 + Electron 主进程单线程：等锁就是同步自旋，而持锁那个窗口的
//!    `COMMIT` 是一个还排在事件循环里的 JS 续体，线程被占住它就永远轮不到。Rust 侧每条连接
//!    活在自己的线程上（命令跑在 Tauri 的 async runtime 的阻塞池里），持锁方能真正推进，
//!    于是 SQLite 自己的忙等就是对的工具，不需要在上层再写一套异步退避。
//! 2. **批处理调度**：Node 版在触发器体内就 `setTimeout`，因为 JS 的定时器无论如何都得等
//!    当前同步执行跑完才可能触发。Rust 的 flusher 是真线程，同样的写法会让事件在语句还没跑完、
//!    事务还没提交时就派发出去。因此截止时间统一在 `execute()` **返回前**设置——但只做这一半
//!    还不够：上一次 `execute()` 设下的截止时间照样会在下一次跑到一半时到期。所以
//!    `execute()` 全程另外挡住派发（[`Engine::hold_flush`]）。两条合起来才等价于 JS 的
//!    宏任务时序：批次只在两次 `execute()` 之间发得出去。
//! 3. **语句切分与只读判定**：见 [`super::script`]。

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rusqlite::config::DbConfig;
use rusqlite::ffi;
use rusqlite::functions::FunctionFlags;
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{Connection, OpenFlags};

use super::error::{ErrorCode, HostError, HostResult};
use super::script::{is_read_only_statement, split_sqlite_script};

/// 注册给 SQLite 的通知函数名；触发器体内调用它把行变更捎回宿主。
const NOTIFY_FUNCTION_NAME: &str = "rxdb_desktop_notify";

/// TEMP 触发器名前缀，方便诊断时一眼认出是本适配器装的。
const TRIGGER_PREFIX: &str = "rxdb_desktop_notify";

/// 适配器自有的系统表；只有它们上面装变更通知触发器。
const WATCH_TABLES: [&str; 3] = ["rxdb$rxdb_change", "rxdb$rxdb_branch", "rxdb$rxdb_migration"];

/// `SQLiteChangeType`，与 `@aiao/rxdb-adapter-sqlite-core` 的枚举同值。
const SQLITE_DELETE: i64 = 9;
const SQLITE_INSERT: i64 = 18;
const SQLITE_UPDATE: i64 = 23;

/// `(变更类型, 触发时机, 取 rowid 的伪表)`。
const NOTIFY_OPERATIONS: [(i64, &str, &str); 3] = [
    (SQLITE_INSERT, "INSERT", "NEW"),
    (SQLITE_UPDATE, "UPDATE", "NEW"),
    (SQLITE_DELETE, "DELETE", "OLD"),
];

/// 默认批处理窗口（毫秒），约一帧 60fps。
pub const DEFAULT_BATCH_TIMEOUT_MS: u64 = 16;

/// 批处理强制 flush 的硬上限（毫秒）。
///
/// 纯 debounce 在持续写入下会被无限重置，事件在整个导入/迁移期间都不会派发。
/// 这个上限保证自批次首个事件起最多 100ms 必定发一次。
///
/// 「最多 100ms」以两次 `execute()` 之间为准：上限到期时若有 `execute()` 在跑，派发要等它
/// 结束（[`PendingState::due_in`]）。一条跑 1s 的语句因此把这一批推到 1s 后——代价换的是
/// 订阅者永远不会收到半条语句，见 [`Engine::hold_flush`]。
pub const MAX_BATCH_WAIT_MS: u64 = 100;

/// 默认 SQLite 页缓存大小（KB），50 MB。
pub const DEFAULT_CACHE_SIZE_KB: u64 = 50 * 1024;

const WAL_AUTOCHECKPOINT_PAGES: u64 = 1000;

/// 撞锁时 SQLite 自己退让重试的时长。
///
/// 关连接时的 checkpoint 是唯一的例外，那里会先把它撤掉——
/// 理由见 [`Engine::checkpoint_without_waiting`]。
const BUSY_TIMEOUT_MS: u32 = 5_000;

/// 变更事件里的 schema 名。
///
/// 恒为 `main`：宿主从不 `ATTACH`，所有表都在主 schema 里。这是 SQLite 的 schema 名，
/// 不是会话打开的那个文件名——上层按它做路由，与 wasm/Electron 后端保持同一常量。
const CHANGE_DB_NAME: &str = "main";

/// 一批合并后的行变更，对应 TS 侧的 `SqliteChangeEvent`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangeEvent {
    /// `SQLiteChangeType`。
    pub change_type: i64,
    /// 逻辑数据库名，恒为 `main`。
    pub db_name: String,
    /// 发生变更的表。
    pub table_name: String,
    /// 变更行的 rowid，按发生顺序。
    pub row_ids: Vec<i64>,
    /// 派发时刻（epoch 毫秒）。
    pub record_at_ms: i64,
}

/// 变更事件的出口：Tauri 下是 `app.emit`，stdio 测试二进制下是标准输出。
pub type ChangeSink = Arc<dyn Fn(ChangeEvent) + Send + Sync>;

/// 一次 `execute()` 的结果，对应 TS 侧的 `SqliteResult`。
#[derive(Debug, Clone, PartialEq)]
pub struct ExecuteResult {
    /// 原样回传的 SQL。
    pub sql: String,
    /// 写语句影响的行数；只读语句恒为 0。
    pub rows_affected: i64,
    /// 耗时（毫秒，带小数）。
    pub elapsed_ms: f64,
    /// 至多一个结果集，且只在语句真的产出列时才有。
    pub results: Option<ResultSet>,
}

/// 一个脚本跑完后的累计产出。
#[derive(Debug, Default)]
struct StatementOutcome {
    /// 第一条产出行的语句的结果集。
    results: Option<ResultSet>,
    /// 各条语句影响行数之和。
    rows_affected: i64,
}

/// 单个结果集。
#[derive(Debug, Clone, PartialEq)]
pub struct ResultSet {
    /// 列名。
    pub columns: Vec<String>,
    /// 行数据。
    pub rows: Vec<Vec<SqlValue>>,
}

/// [`Engine::open`] 的入参。
pub struct EngineOptions {
    /// 数据库文件的绝对物理路径。
    pub file_path: std::path::PathBuf,
    /// 逻辑数据库名，仅用于诊断与错误信息。
    pub db_name: String,
    /// 变更事件窗口（毫秒）。
    pub batch_timeout_ms: u64,
    /// 变更事件出口。
    pub sink: ChangeSink,
}

/// 一个分组：同一「变更类型 + 表」的连续行变更。
#[derive(Debug)]
struct PendingGroup {
    change_type: i64,
    table_name: String,
    row_ids: Vec<i64>,
}

#[derive(Debug, Default)]
struct PendingState {
    /// 按首次出现顺序排列，与 TS 侧 `Map` 的迭代顺序一致。
    groups: Vec<PendingGroup>,
    /// debounce 截止时间，每次 `execute()` 产出变更时重置。
    deadline: Option<Instant>,
    /// 硬上限截止时间，一个批次只设一次，后续事件不重置。
    hard_deadline: Option<Instant>,
    /// 这条连接上是否有一次 `execute()` 正在跑。见 [`PendingState::due_in`]。
    execute_in_flight: bool,
    closed: bool,
}

impl PendingState {
    fn record(&mut self, change_type: i64, table_name: &str, row_id: i64) {
        let existing = self
            .groups
            .iter_mut()
            .find(|group| group.change_type == change_type && group.table_name == table_name);
        match existing {
            Some(group) => group.row_ids.push(row_id),
            None => self.groups.push(PendingGroup {
                change_type,
                table_name: table_name.to_string(),
                row_ids: vec![row_id],
            }),
        }
    }

    fn arm(&mut self, batch_timeout: Duration) {
        if self.groups.is_empty() {
            return;
        }
        let now = Instant::now();
        self.deadline = Some(now + batch_timeout);
        self.hard_deadline
            .get_or_insert_with(|| now + Duration::from_millis(MAX_BATCH_WAIT_MS));
    }

    /// 距离本批次应当派发还有多久；`None` 表示当前无事可做。
    ///
    /// 有 `execute()` 在跑时一律 `None`，哪怕截止时间早就到了。截止时间是**上一次**
    /// `execute()` 设下的，而 flusher 是独立线程：不挡这一下，它会在下一条语句跑到一半时
    /// 醒来取走批次，把该次 `execute()` 已经录下的那部分先发出去，剩下的留给下一批——
    /// 订阅者于是看到半条语句，而此刻这条语句可能正要失败并回滚，那半批通告的是
    /// 一批从未存在过的行。`execute()` 结尾的 [`Engine::arm_flush`] 会清掉这个标志并唤醒
    /// flusher，因此这里只推迟派发，不会把批次拖住。
    fn due_in(&self) -> Option<Duration> {
        if self.execute_in_flight {
            return None;
        }
        let deadline = self.deadline?;
        let target = self.hard_deadline.map_or(deadline, |hard| deadline.min(hard));
        Some(target.saturating_duration_since(Instant::now()))
    }

    fn take_batch(&mut self) -> Vec<PendingGroup> {
        self.deadline = None;
        self.hard_deadline = None;
        std::mem::take(&mut self.groups)
    }
}

fn now_epoch_ms() -> i64 {
    let since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO);
    i64::try_from(since_epoch.as_millis()).unwrap_or(i64::MAX)
}

fn emit_batch(sink: &ChangeSink, batch: Vec<PendingGroup>) {
    // 时间戳整批取一次，与 TS 侧 `#flushChanges` 里的单个 `new Date()` 对齐。
    let record_at_ms = now_epoch_ms();
    for group in batch {
        sink(ChangeEvent {
            change_type: group.change_type,
            db_name: CHANGE_DB_NAME.to_string(),
            table_name: group.table_name,
            row_ids: group.row_ids,
            record_at_ms,
        });
    }
}

/// 等到下一批该派发为止；返回 `None` 表示引擎已关闭，线程应退出。
fn wait_for_batch(state: &Mutex<PendingState>, condvar: &Condvar) -> Option<Vec<PendingGroup>> {
    let mut pending = state.lock().expect("pending state mutex poisoned");
    loop {
        if pending.closed {
            return None;
        }
        match pending.due_in() {
            None => pending = condvar.wait(pending).expect("pending state mutex poisoned"),
            Some(remaining) if remaining.is_zero() => return Some(pending.take_batch()),
            Some(remaining) => {
                pending = condvar
                    .wait_timeout(pending, remaining)
                    .expect("pending state mutex poisoned")
                    .0
            }
        }
    }
}

/// SQLite 主结果码 → 桌面错误码，与 `node-sqlite-engine.ts` 的 `SQLITE_ERROR_CODES` 同一张表。
///
/// 只看主结果码不看扩展码：上层只据此决定「重试 / 提示权限 / 报损坏」，
/// 扩展码的细分（如 `SQLITE_IOERR_*`）不改变这个决定，具体成因留在 message 里。
fn sqlite_error_code(code: rusqlite::ErrorCode) -> Option<ErrorCode> {
    use rusqlite::ErrorCode as Primary;
    match code {
        // 3 SQLITE_PERM / 8 SQLITE_READONLY / 23 SQLITE_AUTH
        Primary::PermissionDenied | Primary::ReadOnly | Primary::AuthorizationForStatementDenied => {
            Some(ErrorCode::PermissionDenied)
        }
        // 11 SQLITE_CORRUPT / 26 SQLITE_NOTADB
        Primary::DatabaseCorrupt | Primary::NotADatabase => Some(ErrorCode::DatabaseCorrupted),
        // 14 SQLITE_CANTOPEN
        Primary::CannotOpen => Some(ErrorCode::OpenFailed),
        // 5 SQLITE_BUSY / 6 SQLITE_LOCKED
        Primary::DatabaseBusy | Primary::DatabaseLocked => Some(ErrorCode::DatabaseBusy),
        _ => None,
    }
}

fn classify(error: &rusqlite::Error, fallback: ErrorCode) -> ErrorCode {
    let rusqlite::Error::SqliteFailure(failure, _) = error else {
        return fallback;
    };
    sqlite_error_code(failure.code).unwrap_or(fallback)
}

fn quote_identifier(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn quote_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// 单个数据库连接。
pub struct Engine {
    /// `close()` 之后为 `None`——句柄必须真正交还给操作系统，否则 `-wal` / `-shm` 旁文件
    /// 不会被 SQLite 删除，AC#8 的「关掉应用后能直接搬走这个文件」就不成立。
    /// 所有取用点都在 `assert_open()` 之后，见 [`Engine::connection`]。
    connection: Option<Connection>,
    db_name: String,
    batch_timeout: Duration,
    state: Arc<(Mutex<PendingState>, Condvar)>,
    sink: ChangeSink,
    flusher: Option<JoinHandle<()>>,
    watched_tables: HashSet<String>,
    /// 由回滚钩子置位，表示 [`Engine::watched_tables`] 可能已经与 temp schema 脱节。
    /// 见 [`Engine::install_rollback_hook`]。
    triggers_may_be_stale: Arc<AtomicBool>,
    closed: Arc<AtomicBool>,
}

impl Engine {
    /// 打开（必要时创建）一个数据库文件。
    ///
    /// 打不开就报错，**绝不**回退到内存库或另一个位置：用户必须能确信数据确实写进了
    /// 他指定的那个文件（AC#5）。初始化中途失败时连接随 `Err` 一起析构，不留悬挂句柄。
    pub fn open(options: EngineOptions) -> HostResult<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let connection = Connection::open_with_flags(&options.file_path, flags).map_err(|error| {
            HostError::new(
                classify(&error, ErrorCode::OpenFailed),
                format!("failed to open desktop database {}: {error}", options.db_name),
            )
        })?;

        let state = Arc::new((Mutex::new(PendingState::default()), Condvar::new()));
        let mut engine = Self {
            connection: Some(connection),
            db_name: options.db_name,
            batch_timeout: Duration::from_millis(options.batch_timeout_ms),
            state,
            sink: options.sink,
            flusher: None,
            watched_tables: HashSet::new(),
            triggers_may_be_stale: Arc::new(AtomicBool::new(false)),
            closed: Arc::new(AtomicBool::new(false)),
        };
        engine.initialize()?;
        engine.start_flusher();
        Ok(engine)
    }

    /// 执行一条或一组 SQL。
    ///
    /// 结果形状与 wasm 后端的 `executeOo1Helper` 逐字对齐：至多一个结果集，且只在语句真的
    /// 产出列时才有；只读语句的 `rowsAffected` 恒为 0，不泄漏上一条写语句遗留的计数。
    ///
    /// 多语句脚本逐条执行，但**不接受绑定参数**：参数属于其中某一条语句，
    /// 静默绑到第一条只会把数据写错位；wasm 后端同样拒绝这个组合。
    pub fn execute(&mut self, sql: &str, bindings: &[SqlValue]) -> HostResult<ExecuteResult> {
        self.assert_open()?;
        let started_at = Instant::now();
        let statements = split_sqlite_script(sql);
        if statements.len() > 1 && !bindings.is_empty() {
            return Err(HostError::violation(format!(
                "multi statement scripts cannot carry bindings, got {} for SQL \"{sql}\"",
                bindings.len()
            )));
        }

        // 从这里到 `arm_flush()` 之间不许派发批次，理由见 [`PendingState::due_in`]。
        // 多语句脚本整条算一次：脚本中途的事务状态同样还没落定。
        self.hold_flush();
        // 前一次是为别的连接刚建好的系统表补装触发器，后一次是为本条语句自己建的表补装。
        let outcome = self
            .ensure_notify_triggers()
            .and_then(|()| self.run_statements(&statements, bindings))
            .and_then(|outcome| {
                self.ensure_notify_triggers()?;
                Ok(outcome)
            });
        // 截止时间在这里才设：语句已经跑完，事务状态已经落定（见模块文档的差异 2）。
        //
        // 失败路径也要设。多语句脚本可能第三条才失败，前两条的行变更已经躺在批次里了；
        // 早退不设截止时间，它们就要等下一次**成功**的 `execute()` 才被捎带发出——
        // 而失败往往紧跟着回滚与断连，那个「下一次」可能根本不会来。
        self.arm_flush();
        let outcome = outcome?;
        Ok(ExecuteResult {
            sql: sql.to_string(),
            rows_affected: outcome.rows_affected,
            elapsed_ms: started_at.elapsed().as_secs_f64() * 1_000.0,
            results: outcome.results,
        })
    }

    /// 报告底层 SQLite 引擎版本，形如 `3.46.1`。
    pub fn version(&mut self) -> HostResult<String> {
        self.assert_open()?;
        self.db()
            .query_row("SELECT sqlite_version()", [], |row| row.get::<_, String>(0))
            .map_err(|error| self.statement_error("SELECT sqlite_version()", &error))
    }

    /// 断开连接并释放文件句柄。
    ///
    /// 关闭前回滚尚未提交的事务并做一次 TRUNCATE checkpoint（AC#8）：前者避免把半截状态
    /// 留给下次启动，后者把 WAL 内容并回主库文件，使调用方随后可以直接重命名/备份这个
    /// `.sqlite3`，而不必额外搬运 `-wal` / `-shm` 旁文件。checkpoint 不为别的连接等待，
    /// 理由见 [`Engine::checkpoint_without_waiting`]。
    ///
    /// 还攒在批次里的变更事件在这里**同步**发掉：flusher 线程随连接一起结束，
    /// 不发就等于把最后一批写入的通知悄悄吞掉。
    ///
    /// 重复调用是安全的。
    pub fn close(&mut self) -> HostResult<()> {
        if self.closed.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        self.stop_flusher();
        self.flush_now();
        let rollback = self.rollback_open_transaction();
        let checkpoint = self.checkpoint_without_waiting();
        // 前两步无论成败都要把句柄交还：一次 checkpoint 失败若连带留住连接，
        // 文件就被永久占住，而这正是本方法要避免的。
        let released = self.release_connection();
        rollback.and(checkpoint).and(released)
    }

    /// 底层连接。
    ///
    /// 只有 `close()` 会取走它，而它先把 `closed` 置位；所有公开入口都以 `assert_open()`
    /// 开头，因此走到这里时连接必定还在。
    fn db(&self) -> &Connection {
        self.connection
            .as_ref()
            .expect("the connection outlives every path guarded by assert_open")
    }

    /// 尽力做一次 TRUNCATE checkpoint，但**不为任何人等待**。
    ///
    /// TRUNCATE 要拿独占锁，因此会被别的连接的读事务挡住，而这条连接上挂着 5 秒的
    /// `busy_timeout`（[`BUSY_TIMEOUT_MS`]）——不先撤掉它，关一个会话就会在忙等里坐满 5 秒。
    /// 这条路径同步跑在调用方线程上，demo 的 `on_window_event` 又在主线程调它：
    /// 于是另一扇窗口开着事务时，关窗口把整个界面冻住数秒。
    ///
    /// 等下去也换不来 AC#8：还有别的连接在读，就说明此刻这个库本来就不能被搬走。
    /// AC#8 真正依赖的是「最后一条连接关闭时 SQLite 自己 checkpoint 并删掉 `-wal` / `-shm`」，
    /// 那条路径由 [`Engine::release_connection`] 走完，不受这里的取舍影响。
    ///
    /// 被挡住时 SQLite 不报错，而是让 `PRAGMA` 在返回行的第一列写 1；`execute_batch` 丢弃
    /// 结果行，所以这里读不到它。这是有意的：多窗口下「没能截断」是常态而不是故障，
    /// 报成错误会让每一次正常的多窗口关闭都在协议上变成一次失败。
    fn checkpoint_without_waiting(&self) -> HostResult<()> {
        self.db()
            .busy_timeout(Duration::ZERO)
            .map_err(|error| self.statement_error("PRAGMA busy_timeout = 0", &error))?;
        self.db()
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
            .map_err(|error| self.statement_error("PRAGMA wal_checkpoint(TRUNCATE)", &error))
    }

    /// 把文件句柄交还给操作系统，SQLite 借此删掉 `-wal` / `-shm` 旁文件。
    fn release_connection(&mut self) -> HostResult<()> {
        let Some(connection) = self.connection.take() else {
            return Ok(());
        };
        connection.close().map_err(|(_, error)| {
            HostError::new(
                classify(&error, ErrorCode::HostInternalError),
                format!("failed to close desktop database {}: {error}", self.db_name),
            )
        })
    }

    /// 装好变更通知函数并跑一遍初始化 pragma。
    fn initialize(&mut self) -> HostResult<()> {
        self.install_authorizer();
        self.install_rollback_hook();
        self.disable_double_quoted_strings()?;
        self.register_notify_function()?;
        let init_sql = format!(
            "PRAGMA temp_store = memory;\n\
             PRAGMA foreign_keys = ON;\n\
             PRAGMA cache_size = -{DEFAULT_CACHE_SIZE_KB};\n\
             PRAGMA journal_mode = WAL;\n\
             PRAGMA synchronous = NORMAL;\n\
             PRAGMA wal_autocheckpoint = {WAL_AUTOCHECKPOINT_PAGES};"
        );
        // `journal_mode` 是查询式 pragma，`execute_batch` 会丢弃它返回的那一行，这里不需要它。
        self.db()
            .execute_batch(&init_sql)
            .map_err(|error| self.open_error("initialize", &error))?;
        self.db()
            .busy_timeout(Duration::from_millis(u64::from(BUSY_TIMEOUT_MS)))
            .map_err(|error| self.open_error("set busy_timeout on", &error))?;
        self.ensure_notify_triggers()
    }

    /// 关掉「双引号串解析不成标识符就退当字符串字面量」这条兼容回退。
    ///
    /// 双引号在 SQL 标准里是**标识符**。SQLite 为了兼容早年写坏的应用留了这条退路，
    /// 于是一个手滑的列名 `SELECT "no_such_colum" FROM t` 不报错，而是安静地返回一列
    /// 内容恰好等于那串拼写的文本——查询错了，却一路绿到 UI 上，等到有人发现数据不对时
    /// 现场早就没了。DDL 与 DML 是两个独立开关，覆盖各自作名字解析的地方（前者如 `CHECK`
    /// 约束与部分索引的 `WHERE`，后者是普通语句里的表达式），所以两个都要关。
    ///
    /// 这是**按连接**的设置而不是编译期开关，因此每次 `open` 都得关一遍；放在
    /// [`Engine::initialize`] 的最前面，好让初始化自己跑的那几条 SQL 也在同一口径下。
    /// 关掉的只有「退当字面量」这一步：双引号作标识符照常可用，`create_notify_triggers`
    /// 里的 `quote_identifier` 因此不受影响。
    fn disable_double_quoted_strings(&self) -> HostResult<()> {
        for config in [DbConfig::SQLITE_DBCONFIG_DQS_DDL, DbConfig::SQLITE_DBCONFIG_DQS_DML] {
            self.db()
                .set_db_config(config, false)
                .map_err(|error| self.open_error("disable double-quoted string literals on", &error))?;
        }
        Ok(())
    }

    /// 事务一回滚就把「哪些表已经装过通知触发器」的记账作废。
    ///
    /// TEMP 触发器住在 temp schema 里，而 SQLite 的事务是跨 schema 的：`BEGIN` 之后建表、
    /// 由语句后钩子补装上的触发器，会和那张表一起被 `ROLLBACK` 抹掉。
    /// [`Engine::watched_tables`] 是这件事的内存缓存，它**不**跟着回滚——于是集合说
    /// 「装过了」、盘上却什么都没有，[`Engine::ensure_notify_triggers`] 从此永远跳过这张表：
    /// 该表之后的每一次写入都不再产生变更事件，而没有任何一处报错。
    ///
    /// 用 SQLite 的回滚钩子而不是在自己发 `ROLLBACK` 的地方清：回滚也可能由 renderer 透传的
    /// SQL、或语句自身的 `ON CONFLICT ROLLBACK` 触发，只认自己那条路径等于漏掉其余两条。
    /// 钩子在执行回滚的那次 `step` 里被同步调用，与本引擎的语句执行同线程。
    ///
    /// 整个集合一起清空，不去区分哪张表的触发器真的没了：钩子拿不到这个信息，而重装是
    /// 幂等的（`CREATE TEMP TRIGGER IF NOT EXISTS`），代价只是回滚之后多一次
    /// `sqlite_master` 查询。
    fn install_rollback_hook(&self) {
        let stale = Arc::clone(&self.triggers_may_be_stale);
        self.db().rollback_hook(Some(move || stale.store(true, Ordering::SeqCst)));
    }

    /// 拒绝会让 SQLite 自己再打开一个数据库文件的 opcode。
    ///
    /// 宿主只解析 `open` 请求里的逻辑库名，物理路径不受 renderer 控制；但 SQL 本身是透传的
    /// （`rawQuery()` 和事务内的 `execute()` 都要求这一点），`ATTACH DATABASE` 能让 SQLite 绕过
    /// 那次路径解析，直接按语句里的字面量打开任意可访问文件。`VACUUM INTO` 不含 ATTACH 关键字，
    /// 但 SQLite 同样走 `SQLITE_ATTACH` 授权码，所以一并被这条规则挡住——这正是必须用授权器
    /// 而不是正则扫 SQL 的原因。
    ///
    /// 只封文件级 opcode，DDL/DML/事务/PRAGMA/TEMP 触发器全部照旧放行，库内能力不受影响。
    /// 与 Electron 侧 `NodeSqliteEngine.#initialize` 的授权器同规则——它直接对 `actionCode` 判，
    /// 这里也必须还原回 opcode 再判，理由见 [`escapes_the_file_scope`]。
    fn install_authorizer(&self) {
        self.db().authorizer(Some(|context: AuthContext<'_>| {
            if escapes_the_file_scope(&context.action) {
                Authorization::Deny
            } else {
                Authorization::Allow
            }
        }));
    }

    /// 注册触发器体内调用的标量函数。
    ///
    /// 不设 `SQLITE_DIRECTONLY`：设了就无法在触发器体内调用，而这正是唯一的调用点。
    fn register_notify_function(&self) -> HostResult<()> {
        let state = Arc::clone(&self.state);
        self.db()
            .create_scalar_function(
                NOTIFY_FUNCTION_NAME,
                3,
                FunctionFlags::SQLITE_UTF8,
                move |context| {
                    let change_type: i64 = context.get(0)?;
                    let table_name: String = context.get(1)?;
                    let row_id: i64 = context.get(2)?;
                    let mut pending = state.0.lock().expect("pending state mutex poisoned");
                    pending.record(change_type, &table_name, row_id);
                    Ok(rusqlite::types::Null)
                },
            )
            .map_err(|error| self.open_error("register the change notify function on", &error))
    }

    fn start_flusher(&mut self) {
        let state = Arc::clone(&self.state);
        let sink = Arc::clone(&self.sink);
        self.flusher = Some(std::thread::spawn(move || {
            while let Some(batch) = wait_for_batch(&state.0, &state.1) {
                emit_batch(&sink, batch);
            }
        }));
    }

    fn stop_flusher(&mut self) {
        {
            let mut pending = self.state.0.lock().expect("pending state mutex poisoned");
            pending.closed = true;
        }
        self.state.1.notify_all();
        if let Some(flusher) = self.flusher.take() {
            let _ = flusher.join();
        }
    }

    /// 在 `execute()` 期间挡住派发，理由见 [`PendingState::due_in`]。
    ///
    /// 不必唤醒 flusher：这个标志只会让它等得更久，而它下一次醒来时必须先拿到同一把锁，
    /// 于是一定看得到。反过来，flusher 判定「到期」与取走批次在同一个临界区里，
    /// 所以也不存在「刚放行就被抢在前面」的窗口。
    fn hold_flush(&self) {
        let mut pending = self.state.0.lock().expect("pending state mutex poisoned");
        pending.execute_in_flight = true;
    }

    /// 语句跑完：放行派发并把截止时间往后顺延一个 debounce。
    ///
    /// 放行与 `arm` 必须在同一个临界区里做完，中间放开锁就等于给 flusher 留了一个
    /// 「按旧截止时间立刻派发」的窗口——那正是 [`Engine::hold_flush`] 要挡的那一下。
    fn arm_flush(&self) {
        let mut pending = self.state.0.lock().expect("pending state mutex poisoned");
        pending.execute_in_flight = false;
        pending.arm(self.batch_timeout);
        drop(pending);
        self.state.1.notify_all();
    }

    fn flush_now(&self) {
        let batch = {
            let mut pending = self.state.0.lock().expect("pending state mutex poisoned");
            pending.take_batch()
        };
        if batch.is_empty() {
            return;
        }
        emit_batch(&self.sink, batch);
    }

    fn assert_open(&self) -> HostResult<()> {
        if self.closed.load(Ordering::SeqCst) {
            return Err(HostError::new(
                ErrorCode::SessionClosed,
                format!("desktop database {} is already closed", self.db_name),
            ));
        }
        Ok(())
    }

    fn open_error(&self, action: &str, error: &rusqlite::Error) -> HostError {
        HostError::new(
            classify(error, ErrorCode::OpenFailed),
            format!("failed to {action} desktop database {}: {error}", self.db_name),
        )
    }

    fn statement_error(&self, sql: &str, error: &rusqlite::Error) -> HostError {
        HostError::new(
            classify(error, ErrorCode::StatementFailed),
            format!(
                "desktop database {} failed for SQL \"{sql}\": {error}",
                self.db_name
            ),
        )
    }

    /// 逐条执行脚本里的语句，只保留**第一条产出行**的语句的结果集。
    ///
    /// 「只留第一条」是照着 oo1 的 `db.exec` 抄的：它遇到第一个 `columnCount > 0` 的语句后
    /// 就不再收集，因此 wasm 后端的一次 `execute()` 至多返回一个结果集。桌面端与之对齐，
    /// 上层才不必分后端处理。
    ///
    /// 影响行数**逐条累加**，与 wasm 后端 `execute_helper.ts` 的
    /// `rowsAffected += sqlite3.changes(db)` 同形：`changes()` 只反映最后一条语句，
    /// 拿它当整个脚本的答案，`DELETE a; DELETE b;` 会漏掉前一条。
    fn run_statements(&self, statements: &[&str], bindings: &[SqlValue]) -> HostResult<StatementOutcome> {
        let mut outcome = StatementOutcome::default();
        for statement in statements {
            let total_changes_before = self.db().total_changes();
            let data = self.run_single_statement(statement, bindings)?;
            outcome.rows_affected = outcome
                .rows_affected
                .saturating_add(self.statement_rows_affected(statement, total_changes_before));
            if outcome.results.is_none() {
                outcome.results = data;
            }
        }
        Ok(outcome)
    }

    /// 单条语句影响的行数。
    ///
    /// # 为什么不能直接报 `changes()`
    ///
    /// `sqlite3_changes()` 只被 INSERT / UPDATE / DELETE 重置。任何别的语句跑完，它仍然是
    /// **上一条写语句**留下的数字——SQLC-030 记的就是这类事故。只读语句由
    /// [`is_read_only_statement`] 挡掉；DDL、PRAGMA、`BEGIN` / `COMMIT` 这些既不是只读、
    /// 又不改行的语句挡不住，于是再用 `total_changes()` 兜一层：它单调递增且只记
    /// 真正改动的行，一条语句前后不变就说明它一行没动，此时 `changes()` 必然是遗留值。
    ///
    /// 兜底只用来判断「动没动」，报出去的仍是 `changes()`：两者对触发器与外键级联的口径
    /// 不同（`total_changes()` 把它们算进去，`changes()` 不算），换成差值会悄悄改变
    /// 级联删除的返回值。
    fn statement_rows_affected(&self, sql: &str, total_changes_before: u64) -> i64 {
        if is_read_only_statement(sql) || self.db().total_changes() == total_changes_before {
            return 0;
        }
        i64::try_from(self.db().changes()).unwrap_or(i64::MAX)
    }

    fn run_single_statement(&self, sql: &str, bindings: &[SqlValue]) -> HostResult<Option<ResultSet>> {
        let mut statement = self
            .db()
            .prepare(sql)
            .map_err(|error| self.statement_error(sql, &error))?;
        let columns: Vec<String> = statement.column_names().into_iter().map(str::to_string).collect();
        let mut rows = statement
            .query(rusqlite::params_from_iter(bindings.iter()))
            .map_err(|error| self.statement_error(sql, &error))?;
        let mut collected = Vec::new();
        while let Some(row) = rows.next().map_err(|error| self.statement_error(sql, &error))? {
            collected.push(read_row(row, columns.len()).map_err(|error| self.statement_error(sql, &error))?);
        }
        if columns.is_empty() {
            return Ok(None);
        }
        Ok(Some(ResultSet {
            columns,
            rows: collected,
        }))
    }

    /// 为已经存在的系统表补装 TEMP 通知触发器。
    ///
    /// 会话打开时这些表往往还不存在——它们由适配器初始化过程现建，所以触发器只能**惰性**安装。
    /// 建表方可能是本连接，也可能是另一个窗口的连接，因此每条语句前后各检查一次：
    /// 只在语句后检查会漏掉本连接开启前、由别的连接建好的表上的第一次写入。
    /// 三张表全部装好后本方法直接返回，稳态下不再查 `sqlite_master`——这份记账由
    /// [`Engine::install_rollback_hook`] 在事务回滚时作废，否则它会记住一批已经不存在的触发器。
    ///
    /// 用 TEMP 触发器而非普通触发器：TEMP 对象只活在本连接的 temp schema 里，永远不会写进
    /// 用户的库文件，因此不会污染他自己的 schema（AC#7），也不会被别的程序看见。
    fn ensure_notify_triggers(&mut self) -> HostResult<()> {
        // 读与复位一步做完：清空之后到重装之间再有回滚，标志必须留给下一轮，不能被覆盖掉。
        if self.triggers_may_be_stale.swap(false, Ordering::SeqCst) {
            self.watched_tables.clear();
        }
        if self.watched_tables.len() == WATCH_TABLES.len() {
            return Ok(());
        }
        let existing = self.read_existing_watch_tables()?;
        for table_name in existing {
            if self.watched_tables.contains(&table_name) {
                continue;
            }
            self.create_notify_triggers(&table_name)?;
            self.watched_tables.insert(table_name);
        }
        Ok(())
    }

    fn read_existing_watch_tables(&self) -> HostResult<Vec<String>> {
        let sql = "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?)";
        let mut statement = self
            .db()
            .prepare(sql)
            .map_err(|error| self.statement_error(sql, &error))?;
        let names = statement
            .query_map(rusqlite::params_from_iter(WATCH_TABLES.iter()), |row| {
                row.get::<_, String>(0)
            })
            .map_err(|error| self.statement_error(sql, &error))?;
        names
            .collect::<Result<Vec<String>, rusqlite::Error>>()
            .map_err(|error| self.statement_error(sql, &error))
    }

    fn create_notify_triggers(&self, table_name: &str) -> HostResult<()> {
        let table = quote_identifier(table_name);
        let literal = quote_literal(table_name);
        for (change_type, event, row) in NOTIFY_OPERATIONS {
            let trigger = quote_identifier(&format!("{TRIGGER_PREFIX}${table_name}${event}"));
            let sql = format!(
                "CREATE TEMP TRIGGER IF NOT EXISTS {trigger} AFTER {event} ON {table} \
                 BEGIN SELECT {NOTIFY_FUNCTION_NAME}({change_type}, {literal}, {row}.rowid); END;"
            );
            self.db()
                .execute_batch(&sql)
                .map_err(|error| self.statement_error(&sql, &error))?;
        }
        Ok(())
    }

    /// 回滚尚未提交的事务；没有事务时什么都不做。
    ///
    /// 先问状态再决定发不发 `ROLLBACK`，而不是无条件发了再按 SQLite 的报错文案豁免——
    /// 那句文案是实现细节，SQLite 改一个字这里就会把「没有事务」当成真故障抛出去，
    /// 而这是关闭路径上最常见的正常情况。`is_autocommit()` 包的是
    /// `sqlite3_get_autocommit()`，是同一个判据的稳定问法，与 Electron 侧
    /// `NodeSqliteEngine` 的 `isTransaction` 同源。
    fn rollback_open_transaction(&self) -> HostResult<()> {
        if self.db().is_autocommit() {
            return Ok(());
        }
        self.db()
            .execute_batch("ROLLBACK")
            .map_err(|error| self.statement_error("ROLLBACK", &error))
    }
}

/// 这条授权动作会不会让 SQLite 自己再打开一个数据库文件。
///
/// **必须按原始 opcode 判，不能按 rusqlite 的枚举变体判。** SQLite 的 `codeAttach` 只在
/// 文件名是 `TK_STRING` 字面量时才把它交给授权器，绑定参数、拼接表达式、子查询算出来的
/// 文件名一律传 NULL；而 rusqlite 的 `AuthAction::from` 要求 `(SQLITE_ATTACH, Some(filename))`
/// 才落成 `Attach`，NULL 于是落进 `Unknown`。只匹配 `Attach { .. }` 等于放行
/// `ATTACH DATABASE ? AS x`——renderer 把路径挪进 `bindings` 就绕过了整道文件边界（RV-002）。
///
/// `Attach` / `Detach` 两个变体仍然显式列出：`Unknown` 是 rusqlite 的兜底分支，它今天怎么分类
/// 是实现细节，两边都判才不依赖那份细节。
fn escapes_the_file_scope(action: &AuthAction<'_>) -> bool {
    match action {
        AuthAction::Attach { .. } | AuthAction::Detach { .. } => true,
        AuthAction::Unknown { code, .. } => *code == ffi::SQLITE_ATTACH || *code == ffi::SQLITE_DETACH,
        _ => false,
    }
}

fn read_row(row: &rusqlite::Row<'_>, column_count: usize) -> Result<Vec<SqlValue>, rusqlite::Error> {
    (0..column_count).map(|index| read_value(row, index)).collect()
}

/// 读一列的值。
///
/// **不能走 `row.get::<_, SqlValue>()`**：rusqlite 的 `From<ValueRef> for Value` 对 TEXT 是
/// `str::from_utf8(..).expect("invalid UTF-8")`，而 SQLite **从不校验** TEXT 的编码——导入的库、
/// 别的程序写的库、一句 `CAST(X'FF' AS TEXT)` 都能造出非法字节。那一下 panic 会毒化会话的
/// `Mutex<Engine>`，从此这条会话连 `close()` 都做不到，同时也推翻了 [`super::session`]
/// 「`Host::handle` 永不 panic」的契约。
///
/// 坏字节按 `from_utf8_lossy` 换成 U+FFFD 报出去，与 Electron 侧 `node:sqlite` 的有损解码
/// 同口径：读得出来的那部分数据照常送达，不因为一个坏字节丢掉整行。
fn read_value(row: &rusqlite::Row<'_>, index: usize) -> Result<SqlValue, rusqlite::Error> {
    let value = match row.get_ref(index)? {
        ValueRef::Null => SqlValue::Null,
        ValueRef::Integer(integer) => SqlValue::Integer(integer),
        ValueRef::Real(real) => SqlValue::Real(real),
        ValueRef::Text(bytes) => SqlValue::Text(String::from_utf8_lossy(bytes).into_owned()),
        ValueRef::Blob(bytes) => SqlValue::Blob(bytes.to_vec()),
    };
    Ok(value)
}

impl Drop for Engine {
    /// 保证 flusher 线程不会比引擎活得更久，即便调用方忘了 `close()`。
    fn drop(&mut self) {
        if self.flusher.is_some() {
            self.stop_flusher();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::{channel, Receiver, Sender};

    struct Harness {
        engine: Engine,
        events: Receiver<ChangeEvent>,
        _directory: TempDirectory,
    }

    /// 测试用临时目录，析构时自己收拾干净。
    struct TempDirectory(std::path::PathBuf);

    impl Drop for TempDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn harness(batch_timeout_ms: u64) -> Harness {
        let directory = std::env::temp_dir().join(format!("rxdb-engine-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let (sender, events): (Sender<ChangeEvent>, Receiver<ChangeEvent>) = channel();
        let engine = Engine::open(EngineOptions {
            file_path: directory.join("app.sqlite3"),
            db_name: "app.sqlite3".into(),
            batch_timeout_ms,
            sink: Arc::new(move |event| {
                let _ = sender.send(event);
            }),
        })
        .unwrap();
        Harness {
            engine,
            events,
            _directory: TempDirectory(directory),
        }
    }

    fn run(engine: &mut Engine, sql: &str) -> ExecuteResult {
        engine.execute(sql, &[]).unwrap()
    }

    /// WAL 的意义是「进程没了，已提交的数据还在」。只读一句 `PRAGMA journal_mode` 证不了
    /// 这件事：除了模式设错以外的任何一种落盘缺陷——事务没提交、WAL 没 checkpoint、
    /// 句柄没关干净——都能让那句话照样答 `wal`。所以这里真的关掉再开一次。
    #[test]
    fn opens_in_wal_mode_so_the_file_survives_a_restart() {
        let directory = temp_directory();
        let file_path = directory.0.join("app.sqlite3");

        let mut first = open_engine(&file_path);
        let mode = run(&mut first, "PRAGMA journal_mode").results.unwrap();
        assert_eq!(mode.rows, vec![vec![SqlValue::Text("wal".into())]]);
        run(&mut first, "CREATE TABLE t (a TEXT)");
        run(&mut first, "INSERT INTO t VALUES ('kept')");
        first.close().unwrap();

        let mut restarted = open_engine(&file_path);
        let rows = run(&mut restarted, "SELECT a FROM t").results.unwrap().rows;
        restarted.close().unwrap();

        assert_eq!(rows, vec![vec![SqlValue::Text("kept".into())]]);
    }

    /// 双引号在 SQL 标准里是**标识符**。SQLite 出于兼容留了一条回退：双引号串解析不成
    /// 已知列名时，就退而当作字符串字面量。于是一个写错的列名 `SELECT "no_such_colum"`
    /// 不报错，而是安静地返回一列内容为该拼写的字符串——查询错了，却一路全绿到 UI 上。
    ///
    /// 这条回退按连接关，不是编译期开关，所以每次 `open` 都得关一遍。
    #[test]
    fn refuses_double_quoted_strings_so_a_typo_in_a_column_name_is_an_error() {
        let mut harness = harness(0);
        run(&mut harness.engine, "CREATE TABLE t (a TEXT)");
        let error = harness
            .engine
            .execute("SELECT \"no_such_column\" FROM t", &[])
            .unwrap_err();
        assert!(error.message.contains("no such column"), "{}", error.message);
        // DDL 侧是另一个开关：`CHECK` 约束里的双引号串以前也会被当字面量收下，
        // 于是一条本该按列比较的约束变成了「与某个常量比较」，永远为真。
        let error = harness
            .engine
            .execute("CREATE TABLE u (a TEXT CHECK (a <> \"x\"))", &[])
            .unwrap_err();
        assert!(error.message.contains("no such column"), "{}", error.message);
        // 单引号仍然是字符串字面量，双引号当标识符也照常可用。
        let result = run(&mut harness.engine, "SELECT 'literal' AS \"a b\"");
        assert_eq!(
            result.results.unwrap().rows,
            vec![vec![SqlValue::Text("literal".into())]]
        );
    }

    #[test]
    fn reports_rows_affected_only_for_writes() {
        let mut harness = harness(0);
        run(&mut harness.engine, "CREATE TABLE t (a INTEGER)");
        let insert = harness
            .engine
            .execute("INSERT INTO t VALUES (?), (?)", &[SqlValue::Integer(1), SqlValue::Integer(2)])
            .unwrap();
        assert_eq!(insert.rows_affected, 2);
        assert!(insert.results.is_none());

        let select = run(&mut harness.engine, "SELECT a FROM t ORDER BY a");
        assert_eq!(select.rows_affected, 0);
        let results = select.results.unwrap();
        assert_eq!(results.columns, ["a"]);
        assert_eq!(
            results.rows,
            vec![vec![SqlValue::Integer(1)], vec![SqlValue::Integer(2)]]
        );
    }

    /// 脚本中途失败时，此前几条语句的行变更已经躺在批次里了。不设截止时间，它们要等下一次
    /// **成功**的 `execute()` 才被捎带发出——而失败往往紧跟着回滚与断连，那个「下一次」
    /// 可能根本不会来，订阅者于是永远收不到这批通知。
    #[test]
    fn still_schedules_pending_changes_when_a_later_statement_fails() {
        let mut harness = harness(0);
        run(&mut harness.engine, "CREATE TABLE \"rxdb$rxdb_change\" (a INTEGER)");
        let failed = harness.engine.execute(
            "INSERT INTO \"rxdb$rxdb_change\" VALUES (1); INSERT INTO \"no_such_table\" VALUES (1);",
            &[],
        );
        assert!(failed.is_err());

        let event = harness.events.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(event.table_name, "rxdb$rxdb_change");
        assert_eq!(event.row_ids.len(), 1);
    }

    /// 与 wasm 后端 `execute_helper.ts` 的 `rowsAffected += sqlite3.changes(db)` 对齐：
    /// `changes()` 只反映最后一条语句，拿它当整个脚本的答案会漏掉前面几条。
    #[test]
    fn sums_rows_affected_across_the_statements_of_a_script() {
        let mut harness = harness(0);
        run(
            &mut harness.engine,
            "CREATE TABLE a (id INTEGER PRIMARY KEY); CREATE TABLE b (id INTEGER PRIMARY KEY);",
        );
        run(
            &mut harness.engine,
            "INSERT INTO a (id) VALUES (1), (2), (3); INSERT INTO b (id) VALUES (1);",
        );
        let deleted = run(&mut harness.engine, "DELETE FROM a; DELETE FROM b;");
        assert_eq!(deleted.rows_affected, 4);
    }

    /// SQLC-030 的脚本版：`changes()` 不被 DDL 重置，一条纯 DDL 脚本会报出上一条写语句的计数。
    #[test]
    fn does_not_inherit_a_stale_changes_count_for_a_script_that_touches_no_rows() {
        let mut harness = harness(0);
        run(&mut harness.engine, "CREATE TABLE t (id INTEGER PRIMARY KEY)");
        assert_eq!(run(&mut harness.engine, "INSERT INTO t (id) VALUES (1), (2)").rows_affected, 2);
        assert_eq!(
            run(&mut harness.engine, "CREATE TABLE u (id INTEGER PRIMARY KEY);").rows_affected,
            0
        );
        assert_eq!(
            run(
                &mut harness.engine,
                "CREATE INDEX ix ON t (id); CREATE INDEX iu ON u (id);"
            )
            .rows_affected,
            0
        );
    }

    /// `RETURNING` 让写语句同时产出行，`rowsAffected` 不能因为它有结果集就归零。
    #[test]
    fn keeps_rows_affected_for_returning_writes() {
        let mut harness = harness(0);
        run(&mut harness.engine, "CREATE TABLE t (a INTEGER)");
        let result = run(&mut harness.engine, "INSERT INTO t VALUES (7) RETURNING a");
        assert_eq!(result.rows_affected, 1);
        assert_eq!(result.results.unwrap().rows, vec![vec![SqlValue::Integer(7)]]);
    }

    /// 参数属于其中某一条语句，静默绑到第一条只会把数据写错位。
    #[test]
    fn refuses_bindings_on_a_multi_statement_script() {
        let mut harness = harness(0);
        let error = harness
            .engine
            .execute("SELECT 1; SELECT 2;", &[SqlValue::Integer(1)])
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::ProtocolViolation);
    }

    #[test]
    fn keeps_only_the_first_result_set_of_a_script() {
        let mut harness = harness(0);
        let result = run(&mut harness.engine, "SELECT 1 AS first; SELECT 2 AS second;");
        assert_eq!(result.results.unwrap().columns, ["first"]);
    }

    #[test]
    fn maps_sqlite_failures_to_stable_codes() {
        let mut harness = harness(0);
        let error = harness.engine.execute("SELECT * FROM missing", &[]).unwrap_err();
        assert_eq!(error.code, ErrorCode::StatementFailed);
        assert!(error.message.contains("app.sqlite3"), "{}", error.message);
    }

    /// 只建目录、不开引擎，供两条失败路径的用例自己摆检材。
    fn temp_directory() -> TempDirectory {
        let path = std::env::temp_dir().join(format!("rxdb-engine-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path).unwrap();
        TempDirectory(path)
    }

    /// RV-002：renderer 可控的 SQL 不能在宿主根之外新建文件。
    ///
    /// 与 Electron 侧 `node-sqlite-engine.spec.ts` 的 `NodeSqliteEngine file scope` 用同一组攻击样例，
    /// 免得只封住其中一个宿主。
    #[test]
    fn denies_attach_and_creates_no_file_outside_the_app_scope() {
        let mut harness = harness(0);
        let outside = temp_directory();
        let escaped = outside.0.join("escaped.sqlite");

        let error = harness
            .engine
            .execute(&format!("ATTACH DATABASE '{}' AS escaped", escaped.display()), &[])
            .unwrap_err();

        assert_eq!(error.code, ErrorCode::PermissionDenied);
        assert!(!escaped.exists());
        // 附加库真被拒了，命名空间就不该存在；否则后续语句仍能写出去
        assert!(harness
            .engine
            .execute("CREATE TABLE escaped.proof (value TEXT)", &[])
            .is_err());
        assert!(!escaped.exists());
    }

    /// RV-002：已存在的外部 SQLite 文件既不能读也不能改。
    #[test]
    fn denies_attach_of_an_existing_external_database() {
        let outside = temp_directory();
        let victim_path = outside.0.join("victim.sqlite");
        let victim = Connection::open(&victim_path).unwrap();
        victim
            .execute_batch("CREATE TABLE secret (value TEXT); INSERT INTO secret VALUES ('classified');")
            .unwrap();
        victim.close().unwrap();
        let before = std::fs::read(&victim_path).unwrap();

        let mut harness = harness(0);
        let error = harness
            .engine
            .execute(&format!("ATTACH DATABASE '{}' AS victim", victim_path.display()), &[])
            .unwrap_err();

        assert_eq!(error.code, ErrorCode::PermissionDenied);
        assert!(harness.engine.execute("SELECT value FROM victim.secret", &[]).is_err());
        assert_eq!(std::fs::read(&victim_path).unwrap(), before);
    }

    /// RV-002：`VACUUM INTO` 不写 ATTACH 关键字，但同样由 SQLite 打开外部文件。
    #[test]
    fn denies_vacuum_into_an_external_path() {
        let mut harness = harness(0);
        run(&mut harness.engine, "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
        let outside = temp_directory();
        let copy = outside.0.join("copy.sqlite");

        let error = harness
            .engine
            .execute(&format!("VACUUM INTO '{}'", copy.display()), &[])
            .unwrap_err();

        assert_eq!(error.code, ErrorCode::PermissionDenied);
        assert!(!copy.exists());
    }

    /// RV-002：文件名是**绑定参数**的 `ATTACH` 同样要拒。
    ///
    /// SQLite 的 `codeAttach` 只在文件名是 `TK_STRING` 字面量时才把它交给授权器，
    /// 其余表达式一律传 NULL，于是 rusqlite 落成 `AuthAction::Unknown` 而不是 `Attach`。
    /// 按变体匹配的授权器会把这一路放行——renderer 只要把路径挪进 `bindings` 就绕过了整道边界。
    #[test]
    fn denies_attach_whose_filename_comes_from_a_binding() {
        let mut harness = harness(0);
        let outside = temp_directory();
        let escaped = outside.0.join("bound.sqlite");

        let error = harness
            .engine
            .execute(
                "ATTACH DATABASE ? AS bound",
                &[SqlValue::Text(escaped.display().to_string())],
            )
            .unwrap_err();

        assert_eq!(error.code, ErrorCode::PermissionDenied);
        assert!(!escaped.exists());
        assert!(harness
            .engine
            .execute("CREATE TABLE bound.proof (value TEXT)", &[])
            .is_err());
        assert!(!escaped.exists());
    }

    /// RV-002：拼接表达式算出来的文件名同样不是字面量，走的是同一条 NULL 路径。
    #[test]
    fn denies_attach_whose_filename_is_a_concatenation() {
        let mut harness = harness(0);
        let outside = temp_directory();
        let escaped = outside.0.join("joined.sqlite");
        let full = escaped.display().to_string();
        let (prefix, suffix) = full.split_at(3);

        let error = harness
            .engine
            .execute(
                &format!(
                    "ATTACH DATABASE ({} || {}) AS joined",
                    quote_literal(prefix),
                    quote_literal(suffix)
                ),
                &[],
            )
            .unwrap_err();

        assert_eq!(error.code, ErrorCode::PermissionDenied);
        assert!(!escaped.exists());
    }

    /// RV-002：子查询产出的文件名——最迂回的一种，仍然只是「非字面量」。
    #[test]
    fn denies_attach_whose_filename_comes_from_a_subquery() {
        let mut harness = harness(0);
        let outside = temp_directory();
        let escaped = outside.0.join("selected.sqlite");

        let error = harness
            .engine
            .execute(
                &format!(
                    "ATTACH DATABASE (SELECT {}) AS selected",
                    quote_literal(&escaped.display().to_string())
                ),
                &[],
            )
            .unwrap_err();

        assert_eq!(error.code, ErrorCode::PermissionDenied);
        assert!(!escaped.exists());
    }

    /// 库内的 `DETACH` 也按原始 opcode 拒，别让「先 ATTACH 不成、再 DETACH 试探」有别的答案。
    #[test]
    fn denies_detach() {
        let mut harness = harness(0);
        let error = harness.engine.execute("DETACH DATABASE nope", &[]).unwrap_err();
        assert_eq!(error.code, ErrorCode::PermissionDenied);
    }

    /// SQLite 从不校验 TEXT 的编码：导入的库、别的程序写的库、`CAST(X'FF' AS TEXT)`
    /// 都能造出不是合法 UTF-8 的文本值。读到它绝不能 panic——`Host::handle` 的契约是
    /// 「永不 panic」，而一次 panic 会毒化会话的 `Mutex<Engine>`，让这条会话连 `close()`
    /// 都做不到。按 `from_utf8_lossy` 报出去，与 Electron 侧 `node:sqlite` 的有损解码一致。
    #[test]
    fn reads_invalid_utf8_text_lossily_and_keeps_the_session_usable() {
        let mut harness = harness(0);

        let casted = run(&mut harness.engine, "SELECT CAST(X'FF' AS TEXT) AS v");
        assert_eq!(
            casted.results.unwrap().rows,
            vec![vec![SqlValue::Text("\u{fffd}".into())]]
        );

        // 存进表里再读出来，走的是同一条 `read_row`——这才是导入的坏数据的实际形状。
        run(&mut harness.engine, "CREATE TABLE t (v TEXT)");
        run(&mut harness.engine, "INSERT INTO t VALUES (CAST(X'6100FF62' AS TEXT))");
        let stored = run(&mut harness.engine, "SELECT v FROM t");
        assert_eq!(
            stored.results.unwrap().rows,
            vec![vec![SqlValue::Text("a\u{0}\u{fffd}b".into())]]
        );

        // 会话仍然可用、仍然可关；毒化的锁两条都做不到。
        assert_eq!(
            run(&mut harness.engine, "SELECT 1 AS v").results.unwrap().rows,
            vec![vec![SqlValue::Integer(1)]]
        );
        harness.engine.close().unwrap();
    }

    /// 授权器不能误伤库内能力：`rawQuery()` 的正常用途必须原样可用。
    #[test]
    fn still_allows_in_database_ddl_dml_transactions_and_pragma() {
        let mut harness = harness(0);
        run(&mut harness.engine, "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
        run(&mut harness.engine, "BEGIN IMMEDIATE");
        harness
            .engine
            .execute("INSERT INTO t (name) VALUES (?)", &[SqlValue::Text("kept".into())])
            .unwrap();
        run(&mut harness.engine, "COMMIT");
        run(&mut harness.engine, "CREATE INDEX idx_t_name ON t (name)");

        let selected = run(&mut harness.engine, "SELECT name FROM t");
        assert_eq!(
            selected.results.unwrap().rows,
            vec![vec![SqlValue::Text("kept".into())]]
        );
        let journal = run(&mut harness.engine, "PRAGMA journal_mode");
        assert_eq!(journal.results.unwrap().rows, vec![vec![SqlValue::Text("wal".into())]]);
    }

    /// AC#5：文件不是数据库时报 `database_corrupted`，且**原字节一个不动**。
    ///
    /// 后半句才是这条用例的重点。`SQLITE_OPEN_CREATE` 让「打不开就当空库新建」变成
    /// 一步之遥的默认行为，而那等于**静默销毁**用户的文件：应用照常显示已连接，
    /// 只是里面什么都没有了。所以断言写的是原内容仍在，而不只是错误码对。
    #[test]
    fn reports_database_corrupted_without_touching_the_original_bytes() {
        let directory = temp_directory();
        let file_path = directory.0.join("app.sqlite3");
        let garbage = b"this file is definitely not a sqlite database";
        std::fs::write(&file_path, garbage).unwrap();

        // `Engine` 没有 `Debug`（里面有连接和线程句柄），所以不能用 `unwrap_err()`。
        let Err(error) = Engine::open(EngineOptions {
            file_path: file_path.clone(),
            db_name: "app.sqlite3".into(),
            batch_timeout_ms: 0,
            sink: Arc::new(|_| {}),
        }) else {
            panic!("opening a non-database file must fail");
        };

        assert_eq!(error.code, ErrorCode::DatabaseCorrupted);
        assert_eq!(std::fs::read(&file_path).unwrap(), garbage);
    }

    /// AC#5：路径开不出来时报 `open_failed`，且不留下同名空库。
    ///
    /// 用「父目录不存在」制造 `SQLITE_CANTOPEN`：它比 chmod 可移植（Windows 上没有 0o000），
    /// 走的又是同一条 `classify` 分支。
    #[test]
    fn reports_open_failed_without_leaving_an_empty_database_behind() {
        let directory = temp_directory();
        let file_path = directory.0.join("missing").join("app.sqlite3");

        let Err(error) = Engine::open(EngineOptions {
            file_path: file_path.clone(),
            db_name: "app.sqlite3".into(),
            batch_timeout_ms: 0,
            sink: Arc::new(|_| {}),
        }) else {
            panic!("opening a path whose parent is missing must fail");
        };

        assert_eq!(error.code, ErrorCode::OpenFailed);
        assert!(!file_path.exists());
        assert!(!file_path.parent().unwrap().exists());
    }

    /// 变更事件只对适配器自有的系统表发出，且合并成按「类型 + 表」分组的批次。
    #[test]
    fn batches_change_events_for_watched_tables() {
        let mut harness = harness(0);
        run(&mut harness.engine, "CREATE TABLE \"rxdb$rxdb_change\" (a INTEGER)");
        run(&mut harness.engine, "CREATE TABLE other (a INTEGER)");
        run(&mut harness.engine, "INSERT INTO other VALUES (1)");
        run(
            &mut harness.engine,
            "INSERT INTO \"rxdb$rxdb_change\" VALUES (1), (2)",
        );

        let event = harness.events.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(event.change_type, SQLITE_INSERT);
        assert_eq!(event.db_name, "main");
        assert_eq!(event.table_name, "rxdb$rxdb_change");
        assert_eq!(event.row_ids, [1, 2]);
        assert!(event.record_at_ms > 0);
        assert!(harness.events.try_recv().is_err(), "unwatched tables must stay silent");
    }

    /// TEMP 触发器与主库共用同一次事务：`CREATE TABLE` 与随之装上的触发器会被同一条
    /// `ROLLBACK` 一起抹掉，而记着「这张表已经装过」的内存集合不跟着回滚。集合一旦与
    /// temp schema 的真相脱节，`ensure_notify_triggers` 就永远跳过这张表——它此后的每一次
    /// 写入都不再产生事件，响应式查询停在原地，且没有任何一处报错。
    ///
    /// 可达：`RxDBAdapterSqliteBase` 的建表脚本跑在 `BEGIN IMMEDIATE` / `COMMIT` 之间，
    /// COMMIT 因磁盘满或 IO 错误失败、同一条会话重试，就是这条路径。
    #[test]
    fn reinstalls_notify_triggers_that_a_rollback_took_away() {
        let mut harness = harness(0);
        run(&mut harness.engine, "BEGIN IMMEDIATE");
        run(&mut harness.engine, "CREATE TABLE \"rxdb$rxdb_change\" (a INTEGER)");
        run(&mut harness.engine, "ROLLBACK");

        run(&mut harness.engine, "CREATE TABLE \"rxdb$rxdb_change\" (a INTEGER)");
        run(&mut harness.engine, "INSERT INTO \"rxdb$rxdb_change\" VALUES (1)");

        let event = harness.events.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(event.table_name, "rxdb$rxdb_change");
        assert_eq!(event.row_ids, [1]);
    }

    /// 事件在语句**跑完之后**才派发；`execute()` 返回时批次还没发出去。
    #[test]
    fn does_not_dispatch_while_a_statement_is_still_running() {
        let mut harness = harness(1_000);
        run(&mut harness.engine, "CREATE TABLE \"rxdb$rxdb_branch\" (a INTEGER)");
        run(&mut harness.engine, "INSERT INTO \"rxdb$rxdb_branch\" VALUES (1)");
        assert!(harness.events.try_recv().is_err());
        // 关闭时同步补发，最后一批写入的通知不会被吞掉。
        harness.engine.close().unwrap();
        let event = harness.events.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(event.row_ids, [1]);
    }

    /// 一条语句的行变更必须整批出现，不能被截止时间从中间切开。
    ///
    /// 批次的截止时间由**上一次** `execute()` 设定，而 flusher 是独立线程：下一条语句
    /// 跑到一半时它照样会醒来取走批次，把这条语句已经录下的那部分先发出去，剩下的留给下一批。
    /// 事件不会丢，但订阅者看到的是一条语句的一半——而此刻这条语句可能正要失败并回滚，
    /// 于是那半批通告的是一批从未存在过的行。模块文档「差异 2」与 `execute()` 里
    /// 「语句已经跑完，事务状态已经落定」都以「不发生这种切分」为前提。
    #[test]
    fn never_splits_one_statement_across_two_batches() {
        let mut harness = harness(50);
        run(&mut harness.engine, "CREATE TABLE \"rxdb$rxdb_change\" (a INTEGER)");
        // 先落一行并设下截止时间，让下一次 `execute()` 在「批次已到期」的状态下开跑。
        // 截止时间只在语句之间设，因此这是唯一能让 flusher 在语句执行中途醒来的前提。
        run(&mut harness.engine, "INSERT INTO \"rxdb$rxdb_change\" VALUES (0)");

        // 两次写入之间隔着一段纯计算，整条脚本远长于 debounce 与硬上限（两者都 <= 100ms）。
        let started_at = Instant::now();
        run(
            &mut harness.engine,
            "INSERT INTO \"rxdb$rxdb_change\" VALUES (1); \
             SELECT count(*) FROM (WITH RECURSIVE spin(n) AS \
               (SELECT 1 UNION ALL SELECT n + 1 FROM spin WHERE n < 3000000) SELECT n FROM spin); \
             INSERT INTO \"rxdb$rxdb_change\" VALUES (2);",
        );
        assert!(
            started_at.elapsed() > Duration::from_millis(MAX_BATCH_WAIT_MS),
            "the test needs a statement that outlives the batch deadlines, took {:?}",
            started_at.elapsed()
        );

        let event = harness.events.recv_timeout(Duration::from_secs(30)).unwrap();
        assert_eq!(
            event.row_ids,
            [1, 2, 3],
            "the first batch must carry the whole execute, not the rows it had recorded by the deadline"
        );
    }

    /// 持续写入下 debounce 会被无限重置，硬上限保证批次仍然发得出去。
    #[test]
    fn forces_a_flush_at_the_hard_deadline() {
        let mut harness = harness(60_000);
        run(&mut harness.engine, "CREATE TABLE \"rxdb$rxdb_change\" (a INTEGER)");
        let started_at = Instant::now();
        while started_at.elapsed() < Duration::from_millis(MAX_BATCH_WAIT_MS * 2) {
            run(&mut harness.engine, "INSERT INTO \"rxdb$rxdb_change\" VALUES (1)");
        }
        let event = harness.events.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(!event.row_ids.is_empty());
    }

    #[test]
    fn rejects_work_after_close_and_tolerates_a_second_close() {
        let mut harness = harness(0);
        harness.engine.close().unwrap();
        harness.engine.close().unwrap();
        assert_eq!(
            harness.engine.execute("SELECT 1", &[]).unwrap_err().code,
            ErrorCode::SessionClosed
        );
        assert_eq!(harness.engine.version().unwrap_err().code, ErrorCode::SessionClosed);
    }

    /// 同一个库上再开一条连接，用于验证跨连接的关闭行为。
    fn open_engine(file_path: &std::path::Path) -> Engine {
        Engine::open(EngineOptions {
            file_path: file_path.to_path_buf(),
            db_name: "app.sqlite3".into(),
            batch_timeout_ms: 0,
            sink: Arc::new(|_| {}),
        })
        .unwrap()
    }

    /// TRUNCATE checkpoint 要等所有读者让开，而这条连接上挂着 5 秒的 `busy_timeout`：
    /// 另一扇窗口正开着读事务时，`close()` 会在忙等里坐满 5 秒。demo 的 `on_window_event`
    /// 在主线程上调它，用户看到的就是关一扇窗口把整个界面冻住数秒。
    ///
    /// 关闭路径上等下去也换不来什么：还有别的连接在读，就说明这个库此刻本来就不能被搬走，
    /// 而 AC#8 真正依赖的是「最后一条连接关闭时 SQLite 自己删掉 `-wal`」——那条路径不受影响，
    /// 由 [`releases_the_file_handle_so_it_can_be_renamed`] 守着。
    #[test]
    fn does_not_wait_out_the_busy_timeout_when_another_connection_is_reading() {
        let directory = temp_directory();
        let file_path = directory.0.join("app.sqlite3");
        let mut closing = open_engine(&file_path);
        let mut reader = open_engine(&file_path);
        run(&mut closing, "CREATE TABLE t (a INTEGER)");
        run(&mut closing, "INSERT INTO t VALUES (1)");
        // 开着的读事务让 TRUNCATE checkpoint 拿不到独占锁。
        run(&mut reader, "BEGIN");
        run(&mut reader, "SELECT count(*) FROM t");

        let started_at = Instant::now();
        closing.close().unwrap();
        let elapsed = started_at.elapsed();
        reader.close().unwrap();
        assert!(
            elapsed < Duration::from_millis(u64::from(BUSY_TIMEOUT_MS) / 5),
            "close() blocked on the busy handler for {elapsed:?}"
        );
    }

    /// AC#8：关闭后 WAL 已 checkpoint、句柄已释放，文件可以直接重命名。
    #[test]
    fn releases_the_file_handle_so_it_can_be_renamed() {
        let mut harness = harness(0);
        run(&mut harness.engine, "CREATE TABLE t (a INTEGER)");
        run(&mut harness.engine, "BEGIN IMMEDIATE");
        run(&mut harness.engine, "INSERT INTO t VALUES (1)");
        harness.engine.close().unwrap();

        let original = harness._directory.0.join("app.sqlite3");
        let renamed = harness._directory.0.join("renamed.sqlite3");
        std::fs::rename(&original, &renamed).unwrap();
        assert!(!harness._directory.0.join("app.sqlite3-wal").exists());

        // 未提交的写入被回滚，不会把半截状态留给下次启动。
        let reopened = Connection::open(&renamed).unwrap();
        let count: i64 = reopened.query_row("SELECT count(*) FROM t", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn reports_the_bundled_sqlite_version() {
        let mut harness = harness(0);
        assert_eq!(harness.engine.version().unwrap(), rusqlite::version());
    }
}
