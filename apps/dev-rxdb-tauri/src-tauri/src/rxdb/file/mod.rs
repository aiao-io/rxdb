//! 桌面文件宿主：把 renderer 送来的 `file.*` 请求落到应用数据目录里的原生文件。
//!
//! 是 `packages/rxdb-adapter-desktop/src/desktop-file-host.ts` 的 Rust 对应物，
//! 存在的理由见 US-505：文件内容此前写在 WebView 的 OPFS 里，与 US-210 的桌面 SQLite
//! 不在同一个备份域——拷走应用数据目录只带走 metadata，恢复后 meta 指向不存在的文件。
//!
//! 三条不变式与 TS 侧逐条对齐：
//! - **原子提交**：写入先落临时文件，`sync_all` 后 `rename` 覆盖目标。进程在任何一刻被杀，
//!   目标要么是旧内容要么是新内容，不会是半写。
//! - **会话归属**：未提交的写入与已持有的锁都挂在会话上，窗口销毁即整体回收。
//! - **永不 panic、永不把错误吞成别的形状**：[`FileHost::handle`] 一律返回协议应答，
//!   失败走 `{ kind:'error', code, message }`。
//!
//! 与 TS 侧的三处有意分歧：
//! 1. 错误消息里带的是**相对路径**，不是物理绝对路径（TS 侧的 writeChunk / commitWrite
//!    会把物理根泄露给 renderer，US-210 有一条测试专门断言根不出现在应答里）；
//! 2. 读帧用 `read_exact` 而不是可能短读的 `read`——并发截断要当场报错，不能悄悄补零；
//! 3. 锁的两处顺序调整，见 [`locks::LockTable::drop_session`]。

pub mod locks;
pub mod protocol;

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::SystemTime;

use serde_json::{json, Value};

use crate::rxdb::error::{ErrorCode, HostError, HostResult};
use crate::rxdb::protocol::{error_response, PROTOCOL_VERSION};
use crate::rxdb::value::encode_bytes;

use self::locks::{LockOutcome, LockTable};
use self::protocol::{parse_file_request, FileRequest, LockMode};

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

/// 判断一次读写是否落在存储根之内。
///
/// 协议层已经逐段挡过 `..` / 绝对路径 / 盘符，这里是**最后一道**：大小写不敏感卷、
/// 以及 renderer 之外的进程在根里留下的符号链接，都可能让逐段校验通过的路径落到根外。
/// [`Path::starts_with`] 按**路径分量**比较，因此 `rxdb-files-evil` 这类同前缀兄弟目录
/// 不会被误判为在根内。
fn resolve_within_root(root: &Path, relative_path: &str) -> HostResult<PathBuf> {
    let root = normalize(root);
    if relative_path.is_empty() {
        return Ok(root);
    }
    let absolute = normalize(&root.join(relative_path));
    if !absolute.starts_with(&root) {
        return Err(HostError::new(
            ErrorCode::InvalidFilePath,
            format!("path escapes the storage root: {relative_path}"),
        ));
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

/// 放弃一次写入。
///
/// 关句柄与删临时文件的失败都吞掉：本函数只跑在放弃路径与会话回收路径上，再报一次
/// 会盖住真正的失败原因，而残留的临时文件下次启动时无害——它带 UUID，不会撞上任何目标名。
fn discard_write(pending: &PendingWrite) {
    drop(pending.file.lock().expect("pending write mutex poisoned").take());
    let _ = fs::remove_file(&pending.temporary);
}

/// 收尾一次写入：`sync_all` 之后再 `rename`。
///
/// **顺序不能反**：rename 本身是原子的，但它只保证目录项的替换原子，不保证文件内容
/// 已经落盘。少了这一步，掉电后目标可能指向一个内容是空洞的新 inode。
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
        .map_err(|error| filesystem_error(&error, &pending.relative_path))
}

impl FileHost {
    /// 用一个物理存储根构造宿主。目录本身不在这里创建：renderer 的 `ensureRoot`
    /// 会发一条根路径的 `file.mkdir`，让「什么时候建目录」保持在一条通路上。
    pub fn new(root: PathBuf) -> Self {
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

    fn close_session(&self, session_id: &str) -> HostResult<Value> {
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
        let temporary = parent.join(format!(".{write_id}.rxdb-tmp"));
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
        if !self.register_write(session_id, &write_id, Arc::clone(&pending)) {
            // 建临时文件期间会话被关掉了：登记不上就没人回收它，这里当场清掉。
            discard_write(&pending);
            return Err(session_closed(session_id));
        }
        Ok(json!({ "kind": "file.writeBegin", "result": { "writeId": write_id } }))
    }

    fn register_write(&self, session_id: &str, write_id: &str, pending: Arc<PendingWrite>) -> bool {
        let mut state = self.lock_state();
        let Some(session) = state.sessions.get_mut(session_id) else {
            return false;
        };
        session.writes.insert(write_id.to_string(), pending);
        true
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
        finish_write(&pending).map_err(|error| {
            let _ = fs::remove_file(&pending.temporary);
            error
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
            let root = std::env::temp_dir().join(format!("rxdb-files-{}", uuid::Uuid::new_v4()));
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
        crate::rxdb::value::decode_bytes(&response["result"]["chunk"]).expect("read frames carry $u8 chunks")
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

    /// AC#4 的最后一道闸。协议层已经挡过 `..`，这里挡的是**根里的符号链接**——
    /// 逐段校验对它无能为力，只有拼完再比前缀才拦得住。
    #[test]
    fn refuses_paths_that_resolve_outside_the_storage_root() {
        let root = std::env::temp_dir().join(format!("rxdb-files-{}", uuid::Uuid::new_v4()));
        let error = resolve_within_root(&root, "../escape").unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidFilePath);
        let error = resolve_within_root(&root, "a/../../escape").unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidFilePath);

        // 同前缀的兄弟目录不在根内：`starts_with` 按路径分量比较，不是按字符串前缀。
        let sibling = root.with_file_name(format!(
            "{}-evil",
            root.file_name().unwrap().to_string_lossy()
        ));
        assert!(!normalize(&sibling).starts_with(normalize(&root)));

        assert_eq!(resolve_within_root(&root, "").unwrap(), normalize(&root));
        assert_eq!(resolve_within_root(&root, "a/b").unwrap(), normalize(&root).join("a/b"));
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
