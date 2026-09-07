//! 桌面文件宿主：把 renderer 送来的 `file.*` 请求落到应用数据目录里的原生文件。
//!
//! 是 `packages/rxdb-adapter-electron/src/electron-file-host.ts` 的 Rust 对应物，
//! 存在的理由见 US-505：文件内容此前写在 WebView 的 OPFS 里，与 US-210 的桌面 SQLite
//! 不在同一个备份域——拷走应用数据目录只带走 metadata，恢复后 meta 指向不存在的文件。
//!
//! 四条不变式与 TS 侧逐条对齐：
//! - **原子提交**：写入先落临时文件，`sync_all` 后 `rename` 覆盖目标。进程在任何一刻被杀，
//!   目标要么是旧内容要么是新内容，不会是半写。
//! - **会话归属**：未提交的写入与已持有的锁都挂在会话上，窗口销毁即整体回收。
//! - **永不 panic、永不把错误吞成别的形状**：[`FileHost::handle`] 一律返回协议应答，
//!   失败走 `{ kind:'error', code, message }`。
//! - **错误消息只带相对路径**：物理根不跨 IPC，US-210 有一条测试专门断言根不出现在应答里。
//!   这条曾经是本侧独有的收紧，Electron 现在同样只报逻辑路径。
//!
//! 与 TS 侧的两处有意分歧：
//! 1. 读帧用 `read_exact` 而不是可能短读的 `read`——并发截断要当场报错，不能悄悄补零；
//! 2. 会话关闭时把尚未被取走的授予结果改判为 `session_closed`，
//!    见 [`locks::LockTable::drop_session`]。

pub mod locks;
pub mod protocol;

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::SystemTime;

use serde_json::{json, Value};

use crate::error::{ErrorCode, HostError, HostResult};
use crate::protocol::{error_response, PROTOCOL_VERSION};
use crate::value::encode_bytes;

use self::locks::{LockOutcome, LockTable};
use self::protocol::{
    parse_file_request, FileRequest, LockMode, MAX_PENDING_WRITES_PER_SESSION, MAX_QUEUED_LOCKS_PER_NAME,
};

/// 全部锁名加起来，同时**阻塞等待**的申请数上限。
///
/// 只在 Rust 侧存在，协议里没有对应常量，因为它防的是 Rust 独有的成本：一个等待中的
/// `file.lockAcquire` 在 TS 宿主那里只是一个挂起的 promise，在这里却是一整条 tokio
/// 阻塞线程——`rxdb_desktop_request` 一请求一 `spawn_blocking`，等待者停在
/// [`FileHost::ready`] 上直到被授予，线程一直算它头上。
///
/// [`MAX_QUEUED_LOCKS_PER_NAME`] 拦不住这件事：会话数没有上限，锁名由 renderer 自己起，
/// 把等待摊到几十个名字上，每名上限一条都碰不到，池子照样能填满。池满之后失守的不止是锁：
/// SQL 请求也走同一个池，宿主会整个停摆。
///
/// 取 64 是因为 tokio 默认的阻塞池是 512 条线程，留下的余量足够 SQL 继续跑；同时它远高于
/// 真实并发——正常用法下等待者是个位数，撞到这条线的只会是失控的调用方。
///
/// 上限按**排队中**的申请数算，因此已经满员时，连那些本来能当场授予、根本不会阻塞的申请
/// 也一并挡掉。这是有意的：到了 64 条线程停在锁上的地步宿主已经不正常了，此刻先保住 SQL
/// 通路，比多放行一次锁申请重要。
///
/// 它比 [`MAX_QUEUED_LOCKS_PER_NAME`] 严格得多——单名排到 256 之前全局早就满了，所以经由
/// 本模块申请时那条每名上限实际触发不到。仍然保留：它是协议里的常量，与 TS 宿主逐条对齐，
/// 报出的也是「违反了哪条协议规则」，而本常量报的是宿主自己的资源边界。
const MAX_BLOCKED_LOCK_WAITERS: usize = 64;

/// 全宿主同时挂着的未完成写入数上限。
///
/// 与 [`MAX_BLOCKED_LOCK_WAITERS`] 同源的一个洞：`MAX_PENDING_WRITES_PER_SESSION` 是**每会话**
/// 的，而会话数没有上限，renderer 想开几个开几个。每一次未完成写入都攥着一个打开的临时文件
/// 句柄，于是句柄总数由调用方说了算，每会话那条一次都不必碰到。
///
/// 句柄耗尽比锁等待更难看：它不落在文件协议上，而是让**进程里任何一处**下一次 `open` 失败——
/// SQLite 开库、WAL、`-shm`，随便哪一个先撞上，报出来的错与真正的原因毫无关系。
///
/// 取值就等于每会话那条，于是本常量恰好堵住**放大**：整个宿主攥着的句柄，不会超过协议允许
/// 单个会话攥着的量。这个数本身谈不上宽裕——macOS 默认的句柄软限制就是 256——但那是协议常量
/// 自带的性质，两端共用，不该由其中一侧的实现单方面收紧。要调得往
/// `DESKTOP_HOST_MAX_PENDING_WRITES_PER_SESSION` 上调，两端一起。
///
/// 与 [`MAX_BLOCKED_LOCK_WAITERS`] 不同，本条**不会**让每会话那条失效：两者取值相同，而每会话
/// 先判，因此单会话写满时报出的仍是「这个会话已满」，与 TS 宿主逐字一致。
const MAX_PENDING_WRITES_PER_HOST: usize = MAX_PENDING_WRITES_PER_SESSION;

/// 一次尚未提交的写入。
///
/// 句柄单独放在自己的 `Mutex` 里：写分片是 I/O，不能占着整张状态表——
/// 一个慢磁盘上的大文件写入会把所有其他会话的 stat / list 一起卡住。
#[derive(Debug)]
struct PendingWrite {
    target: PathBuf,
    temporary: PathBuf,
    /// 报错时用的相对路径。物理根不跨 IPC（AC#4）。
    relative_path: String,
    file: Mutex<Option<File>>,
}

#[derive(Debug, Default)]
struct FileSession {
    writes: HashMap<String, Arc<PendingWrite>>,
}

#[derive(Debug, Default)]
struct FileState {
    sessions: HashMap<String, FileSession>,
    locks: LockTable,
}

impl FileState {
    /// 全表未完成的写入数，跨所有会话。
    ///
    /// 每一条都对应一个打开着的临时文件句柄，因此它同时是一份句柄占用账本——
    /// 上限与理由见 [`MAX_PENDING_WRITES_PER_HOST`]。
    fn pending_write_count(&self) -> usize {
        self.sessions.values().map(|session| session.writes.len()).sum()
    }
}

/// 未提交写入留在盘上的临时产物后缀，对齐 TS 侧的 `DESKTOP_HOST_TEMPORARY_SUFFIX`。
///
/// 它属于线协议的可观测面：未提交的写入**会被列目录看见**，所以「盘上多出来的这个名字
/// 是什么」必须有一个两端共同的答案。
const TEMPORARY_SUFFIX: &str = ".rxdb-tmp";

/// 文件宿主：一个存储根 + 一张会话表 + 一张锁表。
///
/// 存储根在构造时定死为应用数据目录的子目录，renderer 无从改动，也拿不到它的物理值。
#[derive(Debug)]
pub struct FileHost {
    root: PathBuf,
    state: Mutex<FileState>,
    /// 锁被授予或被拒时唤醒等待线程。
    ready: Condvar,
}

fn session_closed(session_id: &str) -> HostError {
    HostError::new(
        ErrorCode::SessionClosed,
        format!("file session {session_id} is not open on this host"),
    )
}

fn write_aborted(write_id: &str) -> HostError {
    HostError::new(
        ErrorCode::WriteAborted,
        format!("write {write_id} is no longer pending"),
    )
}

/// `io::ErrorKind` → 稳定错误码，对齐 TS 侧的 `ERRNO_CODES`。
///
/// 认不出的归 [`ErrorCode::HostInternalError`] 而不是猜一个近似码：猜错会让调用方
/// 按错误的语义去补偿，比明确的「host 出了意料之外的问题」更糟。
fn error_code_for(kind: io::ErrorKind) -> ErrorCode {
    match kind {
        io::ErrorKind::NotFound => ErrorCode::FileNotFound,
        io::ErrorKind::NotADirectory
        | io::ErrorKind::IsADirectory
        | io::ErrorKind::InvalidFilename
        | io::ErrorKind::AlreadyExists => ErrorCode::InvalidFilePath,
        io::ErrorKind::PermissionDenied | io::ErrorKind::ReadOnlyFilesystem => ErrorCode::PermissionDenied,
        io::ErrorKind::StorageFull | io::ErrorKind::QuotaExceeded => ErrorCode::DiskFull,
        _ => ErrorCode::HostInternalError,
    }
}

/// 把一次文件系统失败翻译成协议错误。
///
/// 消息里带的是**相对路径**：物理根是宿主的内部情报，renderer 不需要它就能工作，
/// 拿到了反而多一份可用于探测文件系统布局的信息（AC#4）。
fn filesystem_error(error: &io::Error, relative_path: &str) -> HostError {
    HostError::new(
        error_code_for(error.kind()),
        format!("{error} on {relative_path}"),
    )
}

/// 词法归一化。
///
/// **不用 [`Path::canonicalize`]**：它要求目标已经存在，而这里大量路径是「将要创建」的，
/// 用它会让一次正常的新建写入变成「文件不存在」。
fn normalize(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        if component == Component::CurDir {
            continue;
        }
        if component == Component::ParentDir {
            normalized.pop();
            continue;
        }
        normalized.push(component);
    }
    normalized
}

fn escapes_root(relative_path: &str) -> HostError {
    HostError::new(
        ErrorCode::InvalidFilePath,
        format!("path escapes the storage root: {relative_path}"),
    )
}

/// 把 `trailing`（自底向上收集的段）按原顺序接回 `base`。
fn rebuild(base: PathBuf, trailing: &[std::ffi::OsString]) -> PathBuf {
    let mut resolved = base;
    for segment in trailing.iter().rev() {
        resolved.push(segment);
    }
    resolved
}

/// 求一条**可能尚不存在**的路径的规范形式。
///
/// [`Path::canonicalize`] 只认已经存在的路径，而写入的目标在 `writeBegin` 那一刻往往还不存在。
/// 于是逐级上探到第一个存在的祖先，把它规范化之后再把剩下的段拼回去——不存在的段不可能是
/// 符号链接，拼回去不会漏掉任何一次跳转。
///
/// 一路上探到卷根仍不存在（存储根本身还没建出来）时按字面量返回：此时磁盘上根本没有可解析的
/// 东西，字面量就是它未来的规范形式。TS 侧的 `canonicalize` 是同一套算法。
fn canonicalize_partial(path: &Path) -> io::Result<PathBuf> {
    let mut trailing: Vec<std::ffi::OsString> = Vec::new();
    let mut probe = path.to_path_buf();

    loop {
        match probe.canonicalize() {
            Ok(real) => return Ok(rebuild(real, &trailing)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                let Some(name) = probe.file_name().map(|name| name.to_os_string()) else {
                    return Ok(rebuild(probe, &trailing));
                };
                probe.pop();
                trailing.push(name);
            }
            Err(error) => return Err(error),
        }
    }
}

/// 判断一次读写是否落在存储根之内。
///
/// 协议层已经逐段挡过 `..` / 绝对路径 / 盘符，这里是**最后一道**，两层判定：
///
/// 1. **词法**：拼接与规范化之后才知道路径最终落在哪里。[`Path::starts_with`] 按**路径分量**
///    比较，因此 `rxdb-files-evil` 这类同前缀兄弟目录不会被误判为在根内。
/// 2. **规范形式**：[`normalize`] 不碰文件系统，看不见符号链接那一跳——根内一个指向根外的
///    链接，字面量上完全合法，读写却全落在根之外。因此把根与目标各自 [`canonicalize_partial`]
///    一遍再比一次前缀。根自己也要规范化：macOS 的 `/var`、`/tmp` 本身就是链接，
///    拿字面量的根去比会把每一条合法路径都判成越界。
///
/// 返回的仍是**词法**路径而不是规范形式：链接只要解析后落在根内就是合法的存储布局，
/// 照着它写才是调用方期待的语义。规范形式只用于判定。
///
/// 判定与随后的读写之间存在 TOCTOU 窗口，这里不试图关掉它——关掉需要 `openat` 一级的原语。
/// 「存储根由本应用独占」仍是首要前提，本函数是它的第二道。
/// TS 侧的 `resolveWithinRoot` + `containedPath` 是同一套判定与同一条边界。
fn resolve_within_root(root: &Path, relative_path: &str) -> HostResult<PathBuf> {
    let root = normalize(root);
    let absolute = if relative_path.is_empty() {
        root.clone()
    } else {
        normalize(&root.join(relative_path))
    };
    if !absolute.starts_with(&root) {
        return Err(escapes_root(relative_path));
    }

    let real_root = canonicalize_partial(&root).map_err(|error| filesystem_error(&error, relative_path))?;
    let real_target = canonicalize_partial(&absolute).map_err(|error| filesystem_error(&error, relative_path))?;
    if !real_target.starts_with(&real_root) {
        return Err(escapes_root(relative_path));
    }

    Ok(absolute)
}

fn entry_kind(is_directory: bool) -> &'static str {
    if is_directory {
        "directory"
    } else {
        "file"
    }
}

/// 与 Node 的 `stats.mtimeMs` 同义：Unix epoch 起的毫秒数，保留亚毫秒精度。
fn to_epoch_millis(time: SystemTime) -> f64 {
    match time.duration_since(SystemTime::UNIX_EPOCH) {
        Ok(duration) => duration.as_secs_f64() * 1000.0,
        Err(error) => -(error.duration().as_secs_f64() * 1000.0),
    }
}

/// 判断一个**物理**文件名是不是宿主未提交写入留下的临时产物。
///
/// 与 TS 侧 `isDesktopHostTemporaryName` 的正则逐字段等价：前导点 + 小写 UUID v4 +
/// [`TEMPORARY_SUFFIX`]。手写而不引 `regex`：要钉的就是判据本身，多绕一个依赖去表达它，
/// 反而让两侧更难逐字对照；`recognizes_exactly_the_temporary_names_the_protocol_defines`
/// 照抄了 TS 用例的取值表。
///
/// 判据**不是**「以该后缀结尾」。用户完全可以有一个自己叫 `report.rxdb-tmp` 的文件，
/// 而这个判据的下游是 [`sweep_temporary_files`] 里的 `remove_file`——宽一格就是删别人的数据。
fn is_temporary_name(name: &str) -> bool {
    let Some(rest) = name.strip_prefix('.') else {
        return false;
    };
    let Some(uuid) = rest.strip_suffix(TEMPORARY_SUFFIX) else {
        return false;
    };
    let groups: Vec<&str> = uuid.split('-').collect();
    groups.iter().map(|group| group.len()).eq([8, 4, 4, 4, 12])
        && groups
            .iter()
            .all(|group| group.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()))
}

/// 递归清扫存储根下上一轮遗留的临时产物。
///
/// # 为什么回收点在启动
///
/// 会话回收（`discard_write`）只覆盖体面退出。进程被 SIGKILL、掉电、或 WebView 把宿主
/// 一起拖崩时没有任何收尾代码跑得到，临时文件就永久留在用户的备份域里——一次崩溃一份，
/// 只增不减，而且 `file.list` 会把它当成一个普通文件报出来。构造宿主的这一刻还没有
/// 任何会话，根下符合临时形状的文件因此必然是上一轮的遗留。
///
/// 前提是本应用独占这个根。这在 Tauri 下成立（根在 `app_data_dir` 之下）。万一有第二个
/// 实例正在写，被删掉的临时文件会让它的 commit 以 `file_not_found` 失败——一个**报出来的**
/// 错误，而不是静默的坏数据。
///
/// # 失败怎么办
///
/// 清扫是一次垃圾回收，不是功能路径，因此失败不向上传播：让一个读不动的残留文件把
/// `FileHost` 的构造带崩，等于应用再也打不开自己的数据。根不存在是**首次启动的正常形态**
/// （目录只由 renderer 的 `file.mkdir` 建），静默略过；其余失败写一行 stderr，
/// 与 `commands.rs` 里丢弃无主事件同一手法。
///
/// 用显式栈而不是递归：目录深度来自用户的数据，递归会把它变成栈深度。
fn sweep_temporary_files(root: &Path) {
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => {
                eprintln!("[rxdb-desktop] cannot sweep {}: {error}", directory.display());
                continue;
            }
        };
        for entry in entries.filter_map(Result::ok) {
            // `file_type()` 不跟随符号链接：指向根外的链接因此既不会被递归进去，
            // 也不会被当成文件删掉——它的 `is_file()` 是 false。
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_dir() {
                pending.push(entry.path());
            } else if kind.is_file() && is_temporary_name(&entry.file_name().to_string_lossy()) {
                if let Err(error) = fs::remove_file(entry.path()) {
                    eprintln!("[rxdb-desktop] cannot remove the stale temporary {}: {error}", entry.path().display());
                }
            }
        }
    }
}

/// 放弃一次写入。
///
/// 关句柄与删临时文件的失败都吞掉：本函数只跑在放弃路径与会话回收路径上，再报一次
/// 会盖住真正的失败原因，而残留的临时文件下次启动时无害——它带 UUID，不会撞上任何目标名。
fn discard_write(pending: &PendingWrite) {
    drop(pending.file.lock().expect("pending write mutex poisoned").take());
    let _ = fs::remove_file(&pending.temporary);
}

/// 把目录项的变更刷到盘上。
///
/// `rename` 的原子性只覆盖「要么旧要么新」，不覆盖「已经落盘」：目录项还在页缓存里时掉电，
/// 重启后看到的可能仍是改名前的状态——内容已 `sync_all` 也救不回来，因为指向它的那条目录项没落。
///
/// 吞掉的是「这套文件系统压根不做目录 fsync」这一类信号，`open` 与 `sync_all` 两步都算数：
/// Windows 上 `File::open` 打不开目录（拿不到 `FILE_FLAG_BACKUP_SEMANTICS`），而另一些文件
/// 系统目录能打开、`fsync` 却回 `EINVAL`。两种形状不同，含义是同一个，处理也该是同一个——
/// 那里的 rename 由文件系统日志保证持久性。除这两个错误类别之外一律照常上报，否则
/// 「提交成功」就成了没有依据的断言。
fn sync_directory(directory: &Path) -> io::Result<()> {
    match File::open(directory).and_then(|handle| handle.sync_all()) {
        Err(error) if matches!(error.kind(), io::ErrorKind::PermissionDenied | io::ErrorKind::InvalidInput) => Ok(()),
        other => other,
    }
}

/// 收尾一次写入：`sync_all` → `rename` → 父目录 `sync`。
///
/// **顺序不能反**：内容先落盘，否则掉电后目标可能指向一个内容是空洞的新 inode；
/// 父目录后落盘，否则改名本身可能丢失（见 [`sync_directory`]）。
fn finish_write(pending: &PendingWrite) -> HostResult<()> {
    let file = pending
        .file
        .lock()
        .expect("pending write mutex poisoned")
        .take()
        .ok_or_else(|| filesystem_error(&io::Error::from(io::ErrorKind::NotFound), &pending.relative_path))?;
    file.sync_all()
        .map_err(|error| filesystem_error(&error, &pending.relative_path))?;
    drop(file);
    fs::rename(&pending.temporary, &pending.target)
        .map_err(|error| filesystem_error(&error, &pending.relative_path))?;
    match pending.target.parent() {
        Some(parent) => sync_directory(parent).map_err(|error| filesystem_error(&error, &pending.relative_path)),
        None => Ok(()),
    }
}

impl FileHost {
    /// 用一个物理存储根构造宿主。目录本身不在这里创建：renderer 的 `ensureRoot`
    /// 会发一条根路径的 `file.mkdir`，让「什么时候建目录」保持在一条通路上。
    ///
    /// 构造时清扫上一轮崩溃遗留的临时产物，理由见 [`sweep_temporary_files`]。
    pub fn new(root: PathBuf) -> Self {
        sweep_temporary_files(&root);
        Self {
            root,
            state: Mutex::new(FileState::default()),
            ready: Condvar::new(),
        }
    }

    /// 处理一条来自 renderer 的文件请求。
    ///
    /// **永不返回 `Err`**：失败以 `kind: "error"` 的应答返回。跨 IPC 的拒绝会被压平成
    /// 字符串，稳定错误码随之丢失，而调用方的补偿分支正是按码分派的。
    pub fn handle(&self, request: &Value) -> Value {
        match parse_file_request(request).and_then(|parsed| self.dispatch(parsed)) {
            Ok(response) => response,
            Err(error) => error_response(&error),
        }
    }

    /// 当前打开的文件会话数，用于诊断与关停检查。
    pub fn open_session_count(&self) -> usize {
        self.lock_state().sessions.len()
    }

    /// 某个锁名下正在排队的申请数（不含已授予的那一把）。
    ///
    /// 只用于诊断与多线程用例的同步：等待方是否已入队，从外部没有别的办法观察。
    pub fn queued_lock_count(&self, name: &str) -> usize {
        self.lock_state().locks.queued_count(name)
    }

    /// 关闭全部会话：丢弃未提交的写入、放掉持有的锁、拒掉排队中的申请。
    pub fn close_all(&self) {
        let session_ids: Vec<String> = self.lock_state().sessions.keys().cloned().collect();
        for session_id in session_ids {
            let _ = self.close_session(&session_id);
        }
    }

    fn lock_state(&self) -> MutexGuard<'_, FileState> {
        self.state.lock().expect("file state mutex poisoned")
    }

    fn dispatch(&self, request: FileRequest) -> HostResult<Value> {
        match request {
            FileRequest::Open => Ok(self.open_session()),
            FileRequest::Close { session_id } => self.close_session(&session_id),
            FileRequest::Stat { session_id, path } => self.stat_path(&session_id, &path),
            FileRequest::List { session_id, path } => self.list_path(&session_id, &path),
            FileRequest::Mkdir { session_id, path } => self.make_directory(&session_id, &path),
            FileRequest::Rmdir { session_id, path } => self.remove_directory(&session_id, &path),
            FileRequest::Remove { session_id, path } => self.remove_file(&session_id, &path),
            FileRequest::Move {
                session_id,
                from_path,
                to_path,
            } => self.move_path(&session_id, &from_path, &to_path),
            FileRequest::Read {
                session_id,
                path,
                offset,
                length,
            } => self.read_frame(&session_id, &path, offset, length),
            FileRequest::WriteBegin { session_id, path } => self.write_begin(&session_id, &path),
            FileRequest::WriteChunk {
                session_id,
                write_id,
                chunk,
            } => self.write_chunk(&session_id, &write_id, &chunk),
            FileRequest::WriteCommit { session_id, write_id } => self.write_commit(&session_id, &write_id),
            FileRequest::WriteAbort { session_id, write_id } => self.write_abort(&session_id, &write_id),
            FileRequest::LockAcquire {
                session_id,
                name,
                mode,
            } => self.lock_acquire(&session_id, &name, mode),
            FileRequest::LockRelease { session_id, lock_id } => self.lock_release(&session_id, &lock_id),
        }
    }

    // ---- 会话生命周期 -------------------------------------------------------

    fn open_session(&self) -> Value {
        let session_id = uuid::Uuid::new_v4().to_string();
        self.lock_state()
            .sessions
            .insert(session_id.clone(), FileSession::default());
        json!({
            "kind": "file.open",
            "result": { "sessionId": session_id, "protocolVersion": PROTOCOL_VERSION }
        })
    }

    /// 关闭一个会话：摘掉它、放掉它的锁、丢弃它未提交的写入。
    ///
    /// `pub(crate)`：除了 renderer 发来的 `file.close`，[`DesktopRouter::close_owner`] 也要
    /// 按 id 关会话——窗口销毁时没有任何一条 renderer 请求会再来。
    ///
    /// [`DesktopRouter::close_owner`]: crate::router::DesktopRouter::close_owner
    pub(crate) fn close_session(&self, session_id: &str) -> HostResult<Value> {
        let mut state = self.lock_state();
        let session = state
            .sessions
            .remove(session_id)
            .ok_or_else(|| session_closed(session_id))?;
        state.locks.drop_session(session_id);
        // 先放锁再做 I/O：丢弃临时文件可能很慢，不该把整张状态表按住。
        drop(state);
        self.ready.notify_all();
        for pending in session.writes.values() {
            discard_write(pending);
        }
        Ok(json!({ "kind": "file.close" }))
    }

    fn require_session(&self, session_id: &str) -> HostResult<()> {
        match self.lock_state().sessions.contains_key(session_id) {
            true => Ok(()),
            false => Err(session_closed(session_id)),
        }
    }

    /// 校验会话仍然开着，并解析出物理路径。两件事总是成对发生：
    /// 会话已关的请求不该碰到文件系统。
    fn target_of(&self, session_id: &str, relative_path: &str) -> HostResult<PathBuf> {
        self.require_session(session_id)?;
        resolve_within_root(&self.root, relative_path)
    }

    // ---- 路径操作 -----------------------------------------------------------

    fn stat_path(&self, session_id: &str, relative_path: &str) -> HostResult<Value> {
        let target = self.target_of(session_id, relative_path)?;
        let metadata = match fs::metadata(&target) {
            Ok(metadata) => metadata,
            // 「不存在」不是错误：调用方靠 `null` 区分「没有这个条目」与「读不了这个条目」。
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(json!({ "kind": "file.stat", "result": Value::Null })),
            Err(error) => return Err(filesystem_error(&error, relative_path)),
        };
        let modified = metadata
            .modified()
            .map_err(|error| filesystem_error(&error, relative_path))?;
        let last_modified = serde_json::Number::from_f64(to_epoch_millis(modified)).ok_or_else(|| {
            HostError::new(
                ErrorCode::HostInternalError,
                format!("modification time of {relative_path} is not a finite timestamp"),
            )
        })?;
        let is_directory = metadata.is_dir();
        Ok(json!({
            "kind": "file.stat",
            "result": {
                "kind": entry_kind(is_directory),
                "size": if is_directory { 0 } else { metadata.len() },
                "lastModified": last_modified
            }
        }))
    }

    fn list_path(&self, session_id: &str, relative_path: &str) -> HostResult<Value> {
        let target = self.target_of(session_id, relative_path)?;
        let reader = fs::read_dir(&target).map_err(|error| filesystem_error(&error, relative_path))?;
        let mut entries = Vec::new();
        for entry in reader {
            let entry = entry.map_err(|error| filesystem_error(&error, relative_path))?;
            let is_directory = entry
                .file_type()
                .map_err(|error| filesystem_error(&error, relative_path))?
                .is_dir();
            // 与 Node 的 `readdir` 一致按 UTF-8 有损解码：非 UTF-8 的名字不是本适配器写出来的，
            // 但它们出现在目录里也不该让整次 list 失败。
            entries.push(json!({ "name": entry.file_name().to_string_lossy(), "kind": entry_kind(is_directory) }));
        }
        Ok(json!({ "kind": "file.list", "result": entries }))
    }

    fn make_directory(&self, session_id: &str, relative_path: &str) -> HostResult<Value> {
        let target = self.target_of(session_id, relative_path)?;
        fs::create_dir_all(&target).map_err(|error| filesystem_error(&error, relative_path))?;
        Ok(json!({ "kind": "file.mkdir" }))
    }

    /// 目标不存在时静默成功，与 `rm -rf` 及 TS 侧的 `{ force: true }` 一致——
    /// 删除的语义是「事后它不在那儿」，本来就不在也满足。
    fn remove_directory(&self, session_id: &str, relative_path: &str) -> HostResult<Value> {
        let target = self.target_of(session_id, relative_path)?;
        match fs::remove_dir_all(&target) {
            Ok(()) => Ok(json!({ "kind": "file.rmdir" })),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(json!({ "kind": "file.rmdir" })),
            Err(error) => Err(filesystem_error(&error, relative_path)),
        }
    }

    fn remove_file(&self, session_id: &str, relative_path: &str) -> HostResult<Value> {
        let target = self.target_of(session_id, relative_path)?;
        match fs::remove_file(&target) {
            Ok(()) => Ok(json!({ "kind": "file.remove" })),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(json!({ "kind": "file.remove" })),
            Err(error) => Err(filesystem_error(&error, relative_path)),
        }
    }

    fn move_path(&self, session_id: &str, from_path: &str, to_path: &str) -> HostResult<Value> {
        let source = self.target_of(session_id, from_path)?;
        let target = resolve_within_root(&self.root, to_path)?;
        let parent = parent_of(&target, to_path)?;
        fs::create_dir_all(parent).map_err(|error| filesystem_error(&error, to_path))?;
        fs::rename(&source, &target).map_err(|error| filesystem_error(&error, from_path))?;
        Ok(json!({ "kind": "file.move" }))
    }

    fn read_frame(&self, session_id: &str, relative_path: &str, offset: u64, length: usize) -> HostResult<Value> {
        let target = self.target_of(session_id, relative_path)?;
        let mut file = File::open(&target).map_err(|error| filesystem_error(&error, relative_path))?;
        let size = file
            .metadata()
            .map_err(|error| filesystem_error(&error, relative_path))?
            .len();
        // offset 越过文件尾时得到 0，与 TS 侧 `Math.max(0, Math.min(length, size - offset))` 同值。
        let available = size.saturating_sub(offset).min(length as u64) as usize;
        let mut buffer = vec![0_u8; available];
        if available > 0 {
            file.seek(SeekFrom::Start(offset))
                .map_err(|error| filesystem_error(&error, relative_path))?;
            // `read_exact` 而不是 `read`：长度是刚刚量过的，短读只可能是并发截断，
            // 那种情况要当场报错，不能把补零的缓冲区当成文件内容交出去。
            file.read_exact(&mut buffer)
                .map_err(|error| filesystem_error(&error, relative_path))?;
        }
        Ok(json!({
            "kind": "file.read",
            "result": { "chunk": encode_bytes(&buffer), "eof": offset + available as u64 >= size }
        }))
    }

    // ---- 写入 ---------------------------------------------------------------

    fn write_begin(&self, session_id: &str, relative_path: &str) -> HostResult<Value> {
        let target = self.target_of(session_id, relative_path)?;
        let write_id = uuid::Uuid::new_v4().to_string();
        let parent = parent_of(&target, relative_path)?;
        let temporary = parent.join(format!(".{write_id}{TEMPORARY_SUFFIX}"));
        fs::create_dir_all(parent).map_err(|error| filesystem_error(&error, relative_path))?;
        // `create_new` 等价于 TS 侧的 `'wx'`：临时名带 UUID，撞名只可能是那个名字已被
        // 别处占用，静默覆盖会丢掉它的内容。
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| filesystem_error(&error, relative_path))?;
        let pending = Arc::new(PendingWrite {
            target,
            temporary,
            relative_path: relative_path.to_string(),
            file: Mutex::new(Some(file)),
        });
        if let Err(error) = self.register_write(session_id, &write_id, Arc::clone(&pending)) {
            // 登记不上（会话已关，或挂起的写入到顶了）就没人回收它，这里当场清掉。
            discard_write(&pending);
            return Err(error);
        }
        Ok(json!({ "kind": "file.writeBegin", "result": { "writeId": write_id } }))
    }

    /// 把一次写入挂到会话上。
    ///
    /// 上限在**持锁时**判，而不是在 `write_begin` 开头判一次就放行：并发的 begin 会各自
    /// 通过那次检查，于是上限被冲过去。代价是超限那次已经建了临时文件——调用方随即删掉它。
    fn register_write(&self, session_id: &str, write_id: &str, pending: Arc<PendingWrite>) -> HostResult<()> {
        let mut state = self.lock_state();
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| session_closed(session_id))?;
        if session.writes.len() >= MAX_PENDING_WRITES_PER_SESSION {
            return Err(HostError::new(
                ErrorCode::ProtocolViolation,
                format!("session already has {MAX_PENDING_WRITES_PER_SESSION} pending writes"),
            ));
        }
        // 全局那条要数遍所有会话，所以放在每会话之后：能被前一条挡下的就不必数了。
        if state.pending_write_count() >= MAX_PENDING_WRITES_PER_HOST {
            return Err(HostError::new(
                ErrorCode::ProtocolViolation,
                format!("{MAX_PENDING_WRITES_PER_HOST} writes are already pending on this host"),
            ));
        }
        let session = state.sessions.get_mut(session_id).ok_or_else(|| session_closed(session_id))?;
        session.writes.insert(write_id.to_string(), pending);
        Ok(())
    }

    fn require_write(&self, session_id: &str, write_id: &str) -> HostResult<Arc<PendingWrite>> {
        let state = self.lock_state();
        let session = state
            .sessions
            .get(session_id)
            .ok_or_else(|| session_closed(session_id))?;
        session
            .writes
            .get(write_id)
            .map(Arc::clone)
            .ok_or_else(|| write_aborted(write_id))
    }

    fn take_write(&self, session_id: &str, write_id: &str) -> HostResult<Arc<PendingWrite>> {
        let mut state = self.lock_state();
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| session_closed(session_id))?;
        session
            .writes
            .remove(write_id)
            .ok_or_else(|| write_aborted(write_id))
    }

    fn write_chunk(&self, session_id: &str, write_id: &str, chunk: &[u8]) -> HostResult<Value> {
        let pending = self.require_write(session_id, write_id)?;
        let mut slot = pending.file.lock().expect("pending write mutex poisoned");
        let file = slot.as_mut().ok_or_else(|| write_aborted(write_id))?;
        file.write_all(chunk)
            .map_err(|error| filesystem_error(&error, &pending.relative_path))?;
        Ok(json!({ "kind": "file.writeChunk" }))
    }

    /// 提交：先把写入从会话上摘掉，再收尾。
    ///
    /// 顺序不能反——收尾失败时写入已经不在会话上，重试同一个 `writeId` 会明确地报
    /// `write_aborted`，而不是对着一个已经被删掉的临时文件再 `rename` 一次。
    fn write_commit(&self, session_id: &str, write_id: &str) -> HostResult<Value> {
        let pending = self.take_write(session_id, write_id)?;
        finish_write(&pending).inspect_err(|_| {
            let _ = fs::remove_file(&pending.temporary);
        })?;
        Ok(json!({ "kind": "file.writeCommit" }))
    }

    fn write_abort(&self, session_id: &str, write_id: &str) -> HostResult<Value> {
        let pending = self.take_write(session_id, write_id)?;
        discard_write(&pending);
        Ok(json!({ "kind": "file.writeAbort" }))
    }

    // ---- 锁 -----------------------------------------------------------------

    /// 申请一把锁；拿不到就在条件变量上等。
    ///
    /// 阻塞的是**调用线程**，不是整个宿主：`Condvar::wait` 会先放开状态表锁，
    /// 其他会话的读写照常进行。TS 侧靠 promise 队列做到同一件事。
    fn lock_acquire(&self, session_id: &str, name: &str, mode: LockMode) -> HostResult<Value> {
        let mut state = self.lock_state();
        if !state.sessions.contains_key(session_id) {
            return Err(session_closed(session_id));
        }
        if state.locks.queued_count(name) >= MAX_QUEUED_LOCKS_PER_NAME {
            return Err(HostError::new(
                ErrorCode::ProtocolViolation,
                format!("lock {name} already has {MAX_QUEUED_LOCKS_PER_NAME} queued waiters"),
            ));
        }
        if state.locks.waiting_count() >= MAX_BLOCKED_LOCK_WAITERS {
            return Err(HostError::new(
                ErrorCode::ProtocolViolation,
                format!("{MAX_BLOCKED_LOCK_WAITERS} lock waiters are already blocked on this host"),
            ));
        }
        let lock_id = state.locks.enqueue(name, session_id, mode);
        let outcome = loop {
            if let Some(outcome) = state.locks.take_outcome(&lock_id) {
                break outcome;
            }
            state = self.ready.wait(state).expect("file state mutex poisoned");
        };
        match outcome {
            LockOutcome::Granted => Ok(json!({ "kind": "file.lockAcquire", "result": { "lockId": lock_id } })),
            LockOutcome::Denied(error) => Err(error),
        }
    }

    fn lock_release(&self, session_id: &str, lock_id: &str) -> HostResult<Value> {
        let mut state = self.lock_state();
        if !state.sessions.contains_key(session_id) {
            return Err(session_closed(session_id));
        }
        state.locks.release(lock_id, session_id)?;
        drop(state);
        self.ready.notify_all();
        Ok(json!({ "kind": "file.lockRelease" }))
    }
}

/// 目标的父目录。存储根之内的路径总有父目录，拿不到说明路径校验漏了什么。
fn parent_of<'a>(target: &'a Path, relative_path: &str) -> HostResult<&'a Path> {
    target.parent().ok_or_else(|| {
        HostError::new(
            ErrorCode::InvalidFilePath,
            format!("path has no parent directory: {relative_path}"),
        )
    })
}

impl Drop for FileHost {
    /// 宿主销毁时把未提交的临时文件清掉，免得一次异常退出在用户的数据目录里留下垃圾。
    fn drop(&mut self) {
        self.close_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct Harness {
        host: FileHost,
        root: PathBuf,
        session: String,
    }

    impl Harness {
        fn new() -> Self {
            Self::at(std::env::temp_dir().join(format!("rxdb-files-{}", uuid::Uuid::new_v4())))
        }

        /// 用一个指定的根构造，供启动清扫的用例预先在盘上布置上一轮的残留。
        fn at(root: PathBuf) -> Self {
            let host = FileHost::new(root.clone());
            let session = host.handle(&json!({ "kind": "file.open" }))["result"]["sessionId"]
                .as_str()
                .expect("file.open returns a session id")
                .to_string();
            let harness = Self { host, root, session };
            harness.call(json!({ "kind": "file.mkdir", "path": "" }));
            harness
        }

        /// 发一条请求，自动补上 `sessionId`。
        fn call(&self, mut request: Value) -> Value {
            let record = request.as_object_mut().expect("requests are objects");
            record.insert("sessionId".into(), json!(self.session));
            self.host.handle(&request)
        }

        /// 一次写完一个文件，返回最终应答。
        fn write(&self, path: &str, contents: &[u8]) -> Value {
            let begin = self.call(json!({ "kind": "file.writeBegin", "path": path }));
            let write_id = begin["result"]["writeId"]
                .as_str()
                .unwrap_or_else(|| panic!("writeBegin failed: {begin}"))
                .to_string();
            self.call(json!({
                "kind": "file.writeChunk", "writeId": write_id, "chunk": encode_bytes(contents)
            }));
            self.call(json!({ "kind": "file.writeCommit", "writeId": write_id }))
        }

        fn read(&self, path: &str, offset: u64, length: usize) -> Value {
            self.call(json!({ "kind": "file.read", "path": path, "offset": offset, "length": length }))
        }

        /// 存储根里的临时文件残留。
        fn temporary_files(&self) -> Vec<String> {
            let Ok(reader) = fs::read_dir(&self.root) else {
                return Vec::new();
            };
            reader
                .filter_map(Result::ok)
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .filter(|name| name.ends_with(".rxdb-tmp"))
                .collect()
        }

        /// 等到某个锁名下确实排上了 `expected` 个申请。
        ///
        /// 多线程用例里必须先确认等待方已经入队，再去动锁——否则「释放」可能发生在
        /// 「排队」之前，用例会变成一次无竞争的申请，测的东西悄悄没了。
        fn await_queued(&self, name: &str, expected: usize) {
            while self.host.lock_state().locks.queued_count(name) < expected {
                std::thread::yield_now();
            }
        }
    }

    impl Drop for Harness {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn decoded(response: &Value) -> Vec<u8> {
        crate::value::decode_bytes(&response["result"]["chunk"]).expect("read frames carry $u8 chunks")
    }

    #[test]
    fn writes_and_reads_a_file_through_the_protocol() {
        let harness = Harness::new();
        assert_eq!(harness.write("notes/a.txt", b"hello")["kind"], "file.writeCommit");

        let frame = harness.read("notes/a.txt", 0, 1024);
        assert_eq!(decoded(&frame), b"hello");
        assert_eq!(frame["result"]["eof"], true);
        assert!(harness.root.join("notes/a.txt").is_file());
    }

    /// 分帧读取：最后一帧之前 `eof` 必须是 `false`，否则调用方会提前停下、丢掉后半个文件。
    #[test]
    fn reports_eof_only_on_the_last_frame() {
        let harness = Harness::new();
        harness.write("a.bin", b"0123456789");

        let first = harness.read("a.bin", 0, 4);
        assert_eq!(decoded(&first), b"0123");
        assert_eq!(first["result"]["eof"], false);

        let last = harness.read("a.bin", 8, 4);
        assert_eq!(decoded(&last), b"89");
        assert_eq!(last["result"]["eof"], true);

        let past_end = harness.read("a.bin", 64, 4);
        assert!(decoded(&past_end).is_empty());
        assert_eq!(past_end["result"]["eof"], true);
    }

    /// 原子提交：提交之前目标不得出现，进程在任何一刻停下都不会留下半个文件。
    #[test]
    fn keeps_the_target_untouched_until_the_write_commits() {
        let harness = Harness::new();
        harness.write("a.txt", b"old");

        let begin = harness.call(json!({ "kind": "file.writeBegin", "path": "a.txt" }));
        let write_id = begin["result"]["writeId"].as_str().unwrap().to_string();
        harness.call(json!({ "kind": "file.writeChunk", "writeId": write_id, "chunk": encode_bytes(b"new") }));
        assert_eq!(decoded(&harness.read("a.txt", 0, 64)), b"old", "target still holds the old content");

        harness.call(json!({ "kind": "file.writeCommit", "writeId": write_id }));
        assert_eq!(decoded(&harness.read("a.txt", 0, 64)), b"new");
        assert!(harness.temporary_files().is_empty(), "the temp file is gone");
    }

    /// 上一轮进程被 SIGKILL / 掉电时没有任何收尾代码跑得到，未提交写入的临时产物就留在盘上。
    /// 它在用户的备份域里只增不减，而且 `file.list` 会把它当成一个普通文件报出来。
    ///
    /// 回收点放在构造宿主的那一刻：此刻还没有任何会话，根下符合临时形状的文件必然是遗留。
    #[test]
    fn sweeps_temporaries_left_behind_by_a_previous_run() {
        let root = std::env::temp_dir().join(format!("rxdb-files-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("notes/drafts")).expect("the temp root is ours to create");
        let stale = [
            root.join(".2f1c8a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b.rxdb-tmp"),
            root.join("notes/.7e6d5c4b-3a2f-4e1d-9c8b-7a6f5e4d3c2b.rxdb-tmp"),
            root.join("notes/drafts/.11112222-3333-4444-5555-666677778888.rxdb-tmp"),
        ];
        // 用户自己的文件，名字里也带这个后缀：清扫的判据必须窄到不碰它。
        let keep = [root.join("notes/report.rxdb-tmp"), root.join("notes/drafts/a.txt")];
        for path in stale.iter().chain(keep.iter()) {
            fs::write(path, b"content").expect("the temp root is ours to write");
        }

        let harness = Harness::at(root);

        for path in &stale {
            assert!(!path.exists(), "{} survived the sweep", path.display());
        }
        for path in &keep {
            assert!(path.is_file(), "{} was not the sweep's to remove", path.display());
        }
        assert!(harness.temporary_files().is_empty());
    }

    /// 根还不存在时构造宿主：清扫是一次垃圾回收，缺目录不是错误。
    ///
    /// `FileHost::new` 刻意不建目录（建目录只走 renderer 的 `file.mkdir` 一条路），
    /// 因此「根不存在」是首次启动的**正常**形态，清扫在这里报错会让应用直接打不开。
    #[test]
    fn tolerates_a_storage_root_that_does_not_exist_yet() {
        let harness = Harness::new();
        assert_eq!(harness.write("a.txt", b"hello")["kind"], "file.writeCommit");
    }

    /// 清扫的判据与 TS 侧 `isDesktopHostTemporaryName` 的正则逐例对齐。
    ///
    /// 这张表就是两侧唯一的机械联系，取值直接照抄 `desktop-host-file-protocol.spec.ts`。
    /// 判据每放宽一点，一个真实的用户文件就会被**删掉**——比诊断快照那边把它滤掉更不可逆，
    /// 所以这里认的是完整形状（前导点 + 小写 UUID v4 + 后缀），而不是「以后缀结尾」。
    #[test]
    fn recognizes_exactly_the_temporary_names_the_protocol_defines() {
        let write_id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
        for name in [
            format!(".{write_id}.rxdb-tmp"),
            ".9f8e7d6c-5b4a-4392-8180-7f6e5d4c3b2a.rxdb-tmp".to_string(),
        ] {
            assert!(is_temporary_name(&name), "should be temporary: {name}");
        }
        for name in [
            "report.rxdb-tmp".to_string(),
            ".draft.rxdb-tmp".to_string(),
            format!("{write_id}.rxdb-tmp"),
            format!(".{write_id}.rxdb-tmp.bak"),
            format!(".{}.rxdb-tmp", write_id.to_uppercase()),
            ".rxdb-tmp".to_string(),
            String::new(),
        ] {
            assert!(!is_temporary_name(&name), "should not be temporary: {name}");
        }
    }

    /// 诊断快照靠这个形状把在途上传滤出去（US-905 AC#11）。两个宿主各自生成临时名，
    /// TS 侧的快照用例只钉得住 Electron 那一半；这边的名字一旦漂移（大写 UUID、换后缀、
    /// 少了前导点），快照就会把一条正在写、下一秒自己消失的临时产物报成「有文件无元数据」，
    /// 而这类只在特定时刻复现的误报最难被承认是误报。
    ///
    /// 判据取生产的 [`is_temporary_name`]，它自己由
    /// `recognizes_exactly_the_temporary_names_the_protocol_defines` 钉在 TS 的取值表上；
    /// 这里验的是 `write_begin` 产出的名字落不落在那个形状里，两条断言不重叠。
    #[test]
    fn names_in_flight_temporaries_in_the_shape_the_snapshot_filter_expects() {
        let harness = Harness::new();
        let begin = harness.call(json!({ "kind": "file.writeBegin", "path": "pending.txt" }));
        assert_eq!(begin["kind"], "file.writeBegin", "writeBegin failed: {begin}");

        // 枚举根下**全部**条目，而不是复用 `temporary_files()`：后者按 `.rxdb-tmp` 结尾筛，
        // 用它挑出待验的名字再去验这个名字的形状就成了自证。此刻目标尚未提交，根下只该有临时产物。
        let names: Vec<String> = fs::read_dir(&harness.root)
            .expect("the storage root exists")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();

        assert_eq!(names.len(), 1, "only the in-flight temporary is on disk: {names:?}");
        assert!(is_temporary_name(&names[0]), "unexpected temporary name: {}", names[0]);
    }

    #[test]
    fn abandons_a_write_without_touching_the_target() {
        let harness = Harness::new();
        harness.write("a.txt", b"old");

        let begin = harness.call(json!({ "kind": "file.writeBegin", "path": "a.txt" }));
        let write_id = begin["result"]["writeId"].as_str().unwrap().to_string();
        harness.call(json!({ "kind": "file.writeChunk", "writeId": write_id, "chunk": encode_bytes(b"new") }));
        assert_eq!(harness.call(json!({ "kind": "file.writeAbort", "writeId": write_id }))["kind"], "file.writeAbort");

        assert_eq!(decoded(&harness.read("a.txt", 0, 64)), b"old");
        assert!(harness.temporary_files().is_empty());
        let stale = harness.call(json!({ "kind": "file.writeChunk", "writeId": write_id, "chunk": encode_bytes(b"x") }));
        assert_eq!(stale["code"], "write_aborted");
    }

    /// 每个挂起的写入都占着一个 fd。不设上限，一个只 begin 不 commit 的 renderer
    /// 就能把宿主的 fd 耗光——那时连数据库都打不开，一个 renderer 的 bug 升级成整个应用不可用。
    /// 每会话上限拦不住句柄耗尽：会话数没有上限，把写入摊到足够多的会话上，每会话上限一条
    /// 都碰不到，进程的句柄却已经见底——那时失败的会是别处的 `open`，报出来的错与真因无关。
    #[test]
    fn caps_pending_writes_across_all_sessions() {
        let harness = Harness::new();
        {
            let mut state = harness.host.lock_state();
            for index in 0..MAX_PENDING_WRITES_PER_HOST {
                // 每个会话只挂一条，稳稳落在 `MAX_PENDING_WRITES_PER_SESSION` 之下，
                // 拦下溢出的只能是全局上限。句柄位置留空：这条用例数的是账，不是真的去开文件。
                let mut session = FileSession::default();
                session.writes.insert(
                    format!("write-{index}"),
                    Arc::new(PendingWrite {
                        target: harness.root.join(format!("{index}.bin")),
                        temporary: harness.root.join(format!("{index}.bin{TEMPORARY_SUFFIX}")),
                        relative_path: format!("{index}.bin"),
                        file: Mutex::new(None)
                    })
                );
                state.sessions.insert(format!("session-{index}"), session);
            }
        }

        // 发起方自己一条未完成写入都没有，因此绝不可能是每会话那条拦下它的。
        let overflow = harness.call(json!({ "kind": "file.writeBegin", "path": "overflow.bin" }));

        assert_eq!(overflow["kind"], "error");
        assert_eq!(overflow["code"], "protocol_violation");
        assert!(
            overflow["message"].as_str().is_some_and(|message| message.contains("on this host")),
            "报的应该是全宿主上限，实际是 {}",
            overflow["message"]
        );
    }

    #[test]
    fn caps_pending_writes_per_session() {
        let harness = Harness::new();
        for index in 0..MAX_PENDING_WRITES_PER_SESSION {
            let begin = harness.call(json!({ "kind": "file.writeBegin", "path": format!("bulk/{index}.txt") }));
            assert_eq!(begin["kind"], "file.writeBegin", "write {index} should still fit");
        }

        let overflow = harness.call(json!({ "kind": "file.writeBegin", "path": "bulk/overflow.txt" }));

        assert_eq!(overflow["kind"], "error");
        assert_eq!(overflow["code"], "protocol_violation");
    }

    /// 每个阻塞中的等待者都占着一条 tokio 阻塞线程，而锁名由 renderer 自己起：
    /// 摊到足够多的名字上，每名上限一条都碰不到，池子却已经满了——那时 SQL 也一起停摆。
    #[test]
    fn caps_blocked_lock_waiters_across_all_names() {
        let harness = Harness::new();
        {
            let mut state = harness.host.lock_state();
            for index in 0..MAX_BLOCKED_LOCK_WAITERS {
                let session = format!("queued-{index}");
                state.sessions.insert(session.clone(), FileSession::default());
                // 每个名字各来两次：第一次当场授予，第二次才排上队。每名只压一个等待者，
                // 稳稳落在 `MAX_QUEUED_LOCKS_PER_NAME` 之下，拦下溢出的只能是全局上限。
                let name = format!("files:/{index}");
                state.locks.enqueue(&name, &session, LockMode::Exclusive);
                state.locks.enqueue(&name, &session, LockMode::Exclusive);
            }
        }

        let overflow = harness.call(json!({ "kind": "file.lockAcquire", "name": "files:/fresh", "mode": "exclusive" }));

        assert_eq!(overflow["kind"], "error");
        assert_eq!(overflow["code"], "protocol_violation");
    }

    /// 等待者永不超时（对齐 Web Locks），因此队列只增不减地堆在持有者后面。
    #[test]
    fn caps_queued_lock_waiters_per_name() {
        let harness = Harness::new();
        harness.call(json!({ "kind": "file.lockAcquire", "name": "files:/a", "mode": "exclusive" }));
        {
            let mut state = harness.host.lock_state();
            for index in 0..MAX_QUEUED_LOCKS_PER_NAME {
                let session = format!("queued-{index}");
                state.sessions.insert(session.clone(), FileSession::default());
                state.locks.enqueue("files:/a", &session, LockMode::Exclusive);
            }
        }

        let overflow = harness.call(json!({ "kind": "file.lockAcquire", "name": "files:/a", "mode": "shared" }));

        assert_eq!(overflow["kind"], "error");
        assert_eq!(overflow["code"], "protocol_violation");
    }

    /// 会话是资源边界：窗口销毁后未提交的写入必须整体回收，否则临时文件会一直攒着。
    #[test]
    fn discards_pending_writes_when_the_session_closes() {
        let harness = Harness::new();
        let begin = harness.call(json!({ "kind": "file.writeBegin", "path": "a.txt" }));
        let write_id = begin["result"]["writeId"].as_str().unwrap().to_string();
        assert_eq!(harness.temporary_files().len(), 1);

        assert_eq!(harness.call(json!({ "kind": "file.close" }))["kind"], "file.close");
        assert!(harness.temporary_files().is_empty());
        assert_eq!(harness.host.open_session_count(), 0);

        let orphan = harness.call(json!({ "kind": "file.writeCommit", "writeId": write_id }));
        assert_eq!(orphan["code"], "session_closed");
    }

    /// US-505 AC#8：存储根不可写时给出**稳定错误码**，而不是一句只能读给人看的自由文本。
    ///
    /// AC#8 的另一半（磁盘满）不在这里：它要一个真的会写满的卷，而挂载与格式化不该由一条
    /// `cargo test` 承担。那一半由 `conformance/storage-disk-full.spec.ts` 在一个真实
    /// ramdisk 上跑（macOS 走 `hdiutil` + `diskutil`，Linux 走 tmpfs，Windows 没有免权限
    /// 路径因而跳过）。`error_code_for` 把 `StorageFull | QuotaExceeded` 和
    /// `PermissionDenied | ReadOnlyFilesystem` 映射到同一张表上，两条各由一侧钉住。
    ///
    /// 只在 unix 上跑：Windows 的目录 ACL 不受 `chmod` 影响，照搬只会得到一条恒绿的用例。
    #[cfg(unix)]
    #[test]
    fn reports_an_unwritable_storage_root_as_permission_denied() {
        use std::os::unix::fs::PermissionsExt;

        let harness = Harness::new();
        let original = fs::metadata(&harness.root).expect("the storage root exists").permissions();
        fs::set_permissions(&harness.root, fs::Permissions::from_mode(0o555)).expect("the temp root is ours to seal");

        // root 无视写权限位，某些挂载（如 FAT）也不认它。那时下面的 `writeBegin` 会成功，
        // 断言会红在一个与被测代码无关的理由上。先自己探一下封没封住，没封住就放过——
        // 恒绿的用例不好，因为环境而恒红的用例更糟。
        let sealed = fs::File::create(harness.root.join(".probe")).is_err();
        if !sealed {
            fs::set_permissions(&harness.root, original).expect("the temp root is ours to unseal");
            let _ = fs::remove_file(harness.root.join(".probe"));
            return;
        }

        let response = harness.call(json!({ "kind": "file.writeBegin", "path": "a.txt" }));

        // 先解封再断言：断言失败会 panic，权限留在只读上会让 Drop 里的 `remove_dir_all`
        // 静默失败（那里是 `let _ =`），在别人的临时目录里留下一份删不掉的残骸。
        fs::set_permissions(&harness.root, original).expect("the temp root is ours to unseal");

        assert_eq!(response["kind"], "error");
        assert_eq!(response["code"], "permission_denied");
        assert!(response["message"].as_str().expect("errors carry a message").contains("a.txt"));
    }

    /// 「不存在」与「读不了」是两件事：前者是 `null`，服务层据此走「视为空快照」的分支。
    #[test]
    fn reports_a_missing_entry_as_null_rather_than_an_error() {
        let harness = Harness::new();
        let missing = harness.call(json!({ "kind": "file.stat", "path": "nope.txt" }));
        assert_eq!(missing["kind"], "file.stat");
        assert_eq!(missing["result"], Value::Null);

        harness.write("nope.txt", b"abc");
        let found = harness.call(json!({ "kind": "file.stat", "path": "nope.txt" }));
        assert_eq!(found["result"]["kind"], "file");
        assert_eq!(found["result"]["size"], 3);
        assert!(found["result"]["lastModified"].as_f64().unwrap() > 0.0);
    }

    #[test]
    fn lists_directories_and_files_apart() {
        let harness = Harness::new();
        harness.write("box/a.txt", b"a");
        harness.call(json!({ "kind": "file.mkdir", "path": "box/inner" }));

        let listed = harness.call(json!({ "kind": "file.list", "path": "box" }));
        let mut entries: Vec<(String, String)> = listed["result"]
            .as_array()
            .expect("list returns an array")
            .iter()
            .map(|entry| (entry["name"].as_str().unwrap().to_string(), entry["kind"].as_str().unwrap().to_string()))
            .collect();
        entries.sort();
        assert_eq!(
            entries,
            vec![("a.txt".to_string(), "file".to_string()), ("inner".to_string(), "directory".to_string())]
        );

        let directory = harness.call(json!({ "kind": "file.stat", "path": "box" }));
        assert_eq!(directory["result"]["kind"], "directory");
        assert_eq!(directory["result"]["size"], 0);
    }

    /// 删除的语义是「事后它不在那儿」，本来就不在也满足——调用方不该为此写补偿分支。
    #[test]
    fn treats_removing_a_missing_entry_as_success() {
        let harness = Harness::new();
        assert_eq!(harness.call(json!({ "kind": "file.remove", "path": "ghost.txt" }))["kind"], "file.remove");
        assert_eq!(harness.call(json!({ "kind": "file.rmdir", "path": "ghost" }))["kind"], "file.rmdir");

        harness.write("box/a.txt", b"a");
        assert_eq!(harness.call(json!({ "kind": "file.rmdir", "path": "box" }))["kind"], "file.rmdir");
        assert_eq!(harness.call(json!({ "kind": "file.stat", "path": "box" }))["result"], Value::Null);
    }

    #[test]
    fn moves_an_entry_and_creates_the_missing_parent() {
        let harness = Harness::new();
        harness.write("a.txt", b"payload");

        assert_eq!(harness.call(json!({ "kind": "file.move", "fromPath": "a.txt", "toPath": "deep/b.txt" }))["kind"], "file.move");
        assert_eq!(decoded(&harness.read("deep/b.txt", 0, 64)), b"payload");
        assert_eq!(harness.call(json!({ "kind": "file.stat", "path": "a.txt" }))["result"], Value::Null);

        let missing = harness.call(json!({ "kind": "file.move", "fromPath": "gone.txt", "toPath": "x.txt" }));
        assert_eq!(missing["code"], "file_not_found");
    }

    /// AC#4 的词法闸。协议层已经挡过 `..`，这里挡的是拼接之后才暴露出来的越界——
    /// 逐段校验对它无能为力，只有拼完再比前缀才拦得住。符号链接那一层见
    /// [`refuses_symlinks_that_point_outside_the_storage_root`]。
    #[test]
    fn refuses_paths_that_resolve_outside_the_storage_root() {
        let root = std::env::temp_dir().join(format!("rxdb-files-{}", uuid::Uuid::new_v4()));
        let error = resolve_within_root(&root, "../escape").unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidFilePath);
        let error = resolve_within_root(&root, "a/../../escape").unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidFilePath);

        // 同前缀的兄弟目录不在根内。走真的 `resolve_within_root`：这条路径归一化之后与根
        // 只差一个后缀，包含判据若是按字符串前缀比而不是按路径分量比，它就会被当成根内。
        let sibling = format!("../{}-evil/x", root.file_name().unwrap().to_string_lossy());
        let error = resolve_within_root(&root, &sibling).unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidFilePath);

        assert_eq!(resolve_within_root(&root, "").unwrap(), normalize(&root));
        assert_eq!(resolve_within_root(&root, "a/b").unwrap(), normalize(&root).join("a/b"));
    }

    /// 根外的一块地，用完就地清掉；用例断言失败时也不留在 temp 里。
    #[cfg(unix)]
    struct Outside(PathBuf);

    #[cfg(unix)]
    impl Drop for Outside {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// 在根里种两条指向根外的符号链接：一条文件链接，一条目录链接。
    #[cfg(unix)]
    fn plant_escaping_symlinks(harness: &Harness) -> Outside {
        let outside = Outside(harness.root.with_file_name(format!(
            "{}-outside",
            harness.root.file_name().unwrap().to_string_lossy()
        )));
        fs::create_dir_all(&outside.0).expect("the outside directory is creatable");
        fs::write(outside.0.join("secret.txt"), b"classified").expect("the outside file is writable");
        std::os::unix::fs::symlink(outside.0.join("secret.txt"), harness.root.join("escape.txt"))
            .expect("the file symlink is creatable");
        std::os::unix::fs::symlink(&outside.0, harness.root.join("escape-dir"))
            .expect("the directory symlink is creatable");
        outside
    }

    /// AC#4 的第二道闸：词法判定看不见符号链接那一跳，根里一条指向根外的链接在字面量上
    /// 完全合法，读写却全落在根之外。四条通路（读 / 写 / 移动 / 删除）都得拦住，
    /// 并且根外的内容一个字节都不能动。
    ///
    /// 只在 unix 上跑：Windows 建链接要提权，测的东西会变成「有没有权限」。
    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_that_point_outside_the_storage_root() {
        let harness = Harness::new();
        let outside = plant_escaping_symlinks(&harness);
        harness.write("a.txt", b"payload");

        // 读：既不能顺着文件链接读，也不能顺着目录链接读。
        assert_eq!(harness.read("escape.txt", 0, 64)["code"], "invalid_file_path");
        assert_eq!(harness.read("escape-dir/secret.txt", 0, 64)["code"], "invalid_file_path");
        assert_eq!(harness.call(json!({ "kind": "file.stat", "path": "escape.txt" }))["code"], "invalid_file_path");
        assert_eq!(harness.call(json!({ "kind": "file.list", "path": "escape-dir" }))["code"], "invalid_file_path");

        // 写：链接本身和链接底下的新文件都不能开写。
        for path in ["escape.txt", "escape-dir/planted.txt"] {
            let begin = harness.call(json!({ "kind": "file.writeBegin", "path": path }));
            assert_eq!(begin["code"], "invalid_file_path", "writeBegin accepted {path}");
        }

        // 移动：出去和进来都不行。
        let out = harness.call(json!({ "kind": "file.move", "fromPath": "escape.txt", "toPath": "b.txt" }));
        assert_eq!(out["code"], "invalid_file_path");
        let into = harness.call(json!({ "kind": "file.move", "fromPath": "a.txt", "toPath": "escape-dir/b.txt" }));
        assert_eq!(into["code"], "invalid_file_path");

        // 删除：链接本身也不能删——删掉它等于替调用方动了根外的布局。
        assert_eq!(harness.call(json!({ "kind": "file.remove", "path": "escape.txt" }))["code"], "invalid_file_path");
        assert_eq!(harness.call(json!({ "kind": "file.rmdir", "path": "escape-dir" }))["code"], "invalid_file_path");

        // 根外原封不动。
        assert_eq!(fs::read(outside.0.join("secret.txt")).expect("the outside file survives"), b"classified");
        let survivors: Vec<String> = fs::read_dir(&outside.0)
            .expect("the outside directory survives")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(survivors, vec!["secret.txt".to_string()]);
    }

    /// 封堵的边界：解析后仍落在根内的链接是**合法的存储布局**，不能一起挡掉。
    /// 判定用规范形式，返回的仍是词法路径，读写照着链接走。
    #[cfg(unix)]
    #[test]
    fn follows_symlinks_that_stay_inside_the_storage_root() {
        let harness = Harness::new();
        harness.call(json!({ "kind": "file.mkdir", "path": "docs" }));
        harness.write("docs/note.txt", b"inside");
        std::os::unix::fs::symlink(harness.root.join("docs"), harness.root.join("alias"))
            .expect("the in-root symlink is creatable");

        assert_eq!(decoded(&harness.read("alias/note.txt", 0, 64)), b"inside");
        assert_eq!(harness.write("alias/new.txt", b"through")["kind"], "file.writeCommit");
        assert_eq!(decoded(&harness.read("docs/new.txt", 0, 64)), b"through");
    }

    /// 物理根是宿主的内部情报：它出现在应答里就等于把文件系统布局告诉了 renderer。
    /// US-210 对 SQL 通路有同样的断言。
    #[test]
    fn never_leaks_the_physical_root_in_a_response() {
        let harness = Harness::new();
        harness.write("a.txt", b"payload");
        let responses = [
            harness.call(json!({ "kind": "file.read", "path": "gone.txt", "offset": 0, "length": 8 })),
            harness.call(json!({ "kind": "file.list", "path": "gone" })),
            harness.call(json!({ "kind": "file.writeBegin", "path": "a.txt/nested.txt" })),
            harness.call(json!({ "kind": "file.stat", "path": "a.txt" })),
        ];
        let root = harness.root.to_string_lossy().into_owned();
        for response in responses {
            assert!(!response.to_string().contains(&root), "leaked the storage root: {response}");
        }
    }

    #[test]
    fn refuses_every_request_from_an_unknown_session() {
        let harness = Harness::new();
        let stranger = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
        let requests = [
            json!({ "kind": "file.stat", "sessionId": stranger, "path": "a" }),
            json!({ "kind": "file.list", "sessionId": stranger, "path": "a" }),
            json!({ "kind": "file.writeBegin", "sessionId": stranger, "path": "a" }),
            json!({ "kind": "file.lockAcquire", "sessionId": stranger, "name": "a", "mode": "shared" }),
            json!({ "kind": "file.close", "sessionId": stranger }),
        ];
        for request in requests {
            let response = harness.host.handle(&request);
            assert_eq!(response["code"], "session_closed", "for {request}");
        }
    }

    /// 锁跨线程真跑一遍：仲裁表的单元测试是同步的，这里验证条件变量确实把等待方叫醒了。
    #[test]
    fn blocks_a_second_writer_until_the_first_releases() {
        let harness = Harness::new();
        let held = harness.call(json!({ "kind": "file.lockAcquire", "name": "/a", "mode": "exclusive" }));
        let lock_id = held["result"]["lockId"].as_str().unwrap().to_string();

        std::thread::scope(|scope| {
            let waiter = scope.spawn(|| {
                harness.call(json!({ "kind": "file.lockAcquire", "name": "/a", "mode": "exclusive" }))
            });
            harness.await_queued("/a", 1);
            harness.call(json!({ "kind": "file.lockRelease", "lockId": lock_id }));
            let granted = waiter.join().expect("the waiter thread does not panic");
            assert_eq!(granted["kind"], "file.lockAcquire");
            assert!(granted["result"]["lockId"].is_string());
        });
    }

    /// 会话关闭必须把排队中的申请显式拒掉，否则那条请求的调用方永远等不到应答。
    #[test]
    fn wakes_a_queued_waiter_when_its_session_closes() {
        let harness = Harness::new();
        let blocker = harness.call(json!({ "kind": "file.lockAcquire", "name": "/a", "mode": "exclusive" }));
        assert_eq!(blocker["kind"], "file.lockAcquire");

        let second = harness.host.handle(&json!({ "kind": "file.open" }))["result"]["sessionId"]
            .as_str()
            .unwrap()
            .to_string();
        std::thread::scope(|scope| {
            let waiter = scope.spawn(|| {
                harness.host.handle(&json!({
                    "kind": "file.lockAcquire", "sessionId": second, "name": "/a", "mode": "exclusive"
                }))
            });
            harness.await_queued("/a", 1);
            // 关掉排队方自己的会话：它必须收到 `session_closed`，而不是一直悬着。
            let closed = harness.host.handle(&json!({ "kind": "file.close", "sessionId": second }));
            assert_eq!(closed["kind"], "file.close");
            assert_eq!(waiter.join().expect("the waiter thread does not panic")["code"], "session_closed");
        });
    }
}
