use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State, WebviewWindow};

struct SaveSession {
    file: File,
    temporary: PathBuf,
    destination: PathBuf,
    bytes: usize,
}
impl Drop for SaveSession {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.temporary);
    }
}
#[derive(Default)]
pub struct Saves(Mutex<HashMap<String, SaveSession>>);

#[tauri::command]
pub fn media_open_payment(window: WebviewWindow, url: String) -> Result<(), String> {
    owner(&window)?;
    let parsed = tauri::Url::parse(&url).map_err(|_| "支付地址无效")?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("checkout.stripe.com")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
    {
        return Err("支付地址无效".into());
    }
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg(parsed.as_str())
            .status()
            .map_err(|_| "系统浏览器不可用")?;
        if !status.success() {
            return Err("支付页面尚未打开".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    Err("此系统尚未通过桌面发行验收".into())
}

pub fn profile(root: &Path, candidate: &str, update: bool) -> Result<String, String> {
    uuid::Uuid::parse_str(candidate).map_err(|_| "工作区标识无效")?;
    fs::create_dir_all(root).map_err(|_| "数据目录不可写")?;
    let path = root.join("media-profile-v1");
    if !update {
        match fs::read_to_string(&path) {
            Ok(value) => {
                uuid::Uuid::parse_str(&value).map_err(|_| "原生工作区指针损坏，原数据保留")?;
                return Ok(value);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("原生工作区指针不可读，原数据保留".into()),
        }
    }
    let temporary = root.join(format!("media-profile-{}.tmp", uuid::Uuid::new_v4()));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|_| "工作区指针不可写")?;
    file.write_all(candidate.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|_| "工作区指针写入失败")?;
    fs::rename(temporary, path).map_err(|_| "工作区指针提交失败")?;
    Ok(candidate.to_string())
}

#[tauri::command]
pub fn media_profile(
    window: WebviewWindow,
    candidate: String,
    update: bool,
    saves: State<Saves>,
) -> Result<String, String> {
    owner(&window)?;
    let _lock = saves.0.lock().map_err(|_| "文件服务不可用")?;
    profile(
        &window
            .app_handle()
            .path()
            .app_data_dir()
            .map_err(|_| "数据目录不可用")?,
        &candidate,
        update,
    )
}

fn owner(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("不允许此窗口操作文件".into());
    }
    Ok(())
}

pub fn schema(root: &Path, profile_id: &str, upgrade: bool) -> Result<(), String> {
    let id = uuid::Uuid::parse_str(profile_id).map_err(|_| "工作区标识无效")?;
    let directory = root.join("media-schema");
    fs::create_dir_all(&directory).map_err(|_| "版本目录不可写")?;
    let path = directory.join(id.to_string());
    let version = match fs::read_to_string(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => "1".into(),
        Err(_) => return Err("版本标记不可读，原数据保留".into()),
    };
    if version != "1" && version != "2" {
        return Err("本机数据版本不兼容，请更新应用；原数据保留".into());
    }
    let next = if upgrade || version == "2" { "2" } else { "1" };
    if path.exists() && version == next {
        return Ok(());
    }
    let temporary = directory.join(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|_| "版本标记不可写")?;
    file.write_all(next.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|_| "版本标记写入失败")?;
    fs::rename(&temporary, &path).map_err(|_| "版本标记提交失败")?;
    Ok(())
}

#[tauri::command]
pub fn media_schema(
    window: WebviewWindow,
    profile_id: String,
    upgrade: bool,
    saves: State<Saves>,
) -> Result<(), String> {
    owner(&window)?;
    let _lock = saves.0.lock().map_err(|_| "文件服务不可用")?;
    schema(
        &window
            .app_handle()
            .path()
            .app_data_dir()
            .map_err(|_| "数据目录不可用")?,
        &profile_id,
        upgrade,
    )
}

#[tauri::command]
pub async fn media_begin_save(
    window: WebviewWindow,
    name: String,
    saves: State<'_, Saves>,
) -> Result<Option<String>, String> {
    owner(&window)?;
    if name.len() > 160
        || name.contains(['/', '\\'])
        || ![".png", ".jpg", ".json"]
            .iter()
            .any(|ext| name.ends_with(ext))
    {
        return Err("文件名无效".into());
    }
    let destination = tauri::async_runtime::spawn_blocking(move || {
        rfd::FileDialog::new().set_file_name(&name).save_file()
    })
    .await
    .map_err(|_| "保存对话框不可用")?;
    let Some(destination) = destination else {
        return Ok(None);
    };
    let temporary = destination.with_file_name(format!(".aiao-{}.tmp", uuid::Uuid::new_v4()));
    let file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|_| "目标目录不可写")?;
    let token = uuid::Uuid::new_v4().to_string();
    saves.0.lock().map_err(|_| "文件服务不可用")?.insert(
        token.clone(),
        SaveSession {
            file,
            temporary,
            destination,
            bytes: 0,
        },
    );
    Ok(Some(token))
}

#[tauri::command]
pub fn media_write_save(
    window: WebviewWindow,
    token: String,
    bytes: Vec<u8>,
    saves: State<Saves>,
) -> Result<(), String> {
    owner(&window)?;
    let mut sessions = saves.0.lock().map_err(|_| "文件服务不可用")?;
    let session = sessions.get_mut(&token).ok_or("文件会话已关闭")?;
    if bytes.len() > 65536 || session.bytes + bytes.len() > 64 * 1024 * 1024 {
        return Err("文件大小超限".into());
    }
    session
        .file
        .write_all(&bytes)
        .map_err(|_| "写入失败，原文件保留")?;
    session.bytes += bytes.len();
    Ok(())
}

#[tauri::command]
pub fn media_finish_save(
    window: WebviewWindow,
    token: String,
    saves: State<Saves>,
) -> Result<(), String> {
    owner(&window)?;
    let mut session = saves
        .0
        .lock()
        .map_err(|_| "文件服务不可用")?
        .remove(&token)
        .ok_or("文件会话已关闭")?;
    session
        .file
        .flush()
        .and_then(|_| session.file.sync_all())
        .map_err(|_| "文件提交失败")?;
    fs::rename(&session.temporary, &session.destination)
        .map_err(|_| "文件替换失败，原文件保留".to_string())
}

#[tauri::command]
pub fn media_abort_save(
    window: WebviewWindow,
    token: String,
    saves: State<Saves>,
) -> Result<(), String> {
    owner(&window)?;
    saves.0.lock().map_err(|_| "文件服务不可用")?.remove(&token);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn marker_never_downgrades_or_accepts_unknown_versions() {
        let root = std::env::temp_dir().join(format!("aiao-media-{}", uuid::Uuid::new_v4()));
        let id = uuid::Uuid::new_v4().to_string();
        schema(&root, &id, false).unwrap();
        schema(&root, &id, true).unwrap();
        schema(&root, &id, false).unwrap();
        let marker = root.join("media-schema").join(&id);
        assert_eq!(fs::read_to_string(&marker).unwrap(), "2");
        fs::write(&marker, "3").unwrap();
        assert!(schema(&root, &id, true).is_err());
        assert_eq!(fs::read_to_string(&marker).unwrap(), "3");
        assert!(schema(&root, "../bad", false).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn native_profile_survives_webview_reset_and_rejects_corruption() {
        let root = std::env::temp_dir().join(format!("aiao-media-{}", uuid::Uuid::new_v4()));
        let first = uuid::Uuid::new_v4().to_string();
        let next = uuid::Uuid::new_v4().to_string();
        assert_eq!(profile(&root, &first, false).unwrap(), first);
        assert_eq!(profile(&root, &next, false).unwrap(), first);
        assert_eq!(profile(&root, &next, true).unwrap(), next);
        fs::write(root.join("media-profile-v1"), "broken").unwrap();
        assert!(profile(&root, &first, false).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
