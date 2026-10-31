#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod files;
use aiao_rxdb_tauri::commands::DesktopHost;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .manage(files::Saves::default())
        .invoke_handler(tauri::generate_handler![
            aiao_rxdb_tauri::commands::rxdb_desktop_request,
            files::media_schema,
            files::media_profile,
            files::media_open_payment,
            files::media_begin_save,
            files::media_write_save,
            files::media_finish_save,
            files::media_abort_save
        ])
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            app.manage(DesktopHost::new(app.handle(), data, &["main"]));
            let api_origin = option_env!("AIAO_MEDIA_API_ORIGIN").unwrap_or("https://media.aiao.io");
            let initialization = format!("globalThis.__AIAO_MEDIA_API_ORIGIN__ = {};", serde_json::to_string(api_origin).unwrap());
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .initialization_script(&initialization)
                .on_navigation(|url| url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<DesktopHost>().close_window(window.label());
            }
        })
        .build(tauri::generate_context!())
        .expect("Aiao Media 启动失败")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<DesktopHost>().close_all();
            }
        });
}
