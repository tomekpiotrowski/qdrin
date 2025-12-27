use tauri::{
    menu::{Menu, MenuItem},
    Manager, State,
};
use std::sync::{Arc, Mutex};
use warp::Filter;

// Shared state for focus mode
#[derive(Default, Clone)]
struct FocusState {
    is_focusing: Arc<Mutex<bool>>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn set_focus_state(state: State<'_, FocusState>, is_focusing: bool) {
    if let Ok(mut focus) = state.is_focusing.lock() {
        *focus = is_focusing;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let focus_state = FocusState::default();
    let focus_state_for_server = focus_state.clone();

    // Spawn HTTP server for browser extension communication
    tauri::async_runtime::spawn(async move {
        let state = focus_state_for_server;

        let status = warp::path("status")
            .and(warp::get())
            .map(move || {
                let is_focusing = state.is_focusing.lock().unwrap_or_else(|e| e.into_inner());
                warp::reply::json(&serde_json::json!({
                    "is_focusing": *is_focusing
                }))
            });

        let cors = warp::cors()
            .allow_any_origin()
            .allow_methods(vec!["GET"]);

        warp::serve(status.with(cors))
            .run(([127, 0, 0, 1], 42069))
            .await;
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(focus_state)
        .invoke_handler(tauri::generate_handler![greet, set_focus_state])
        .setup(|app| {
            // Create tray menu
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let tray = app.tray_by_id("main").unwrap();
            tray.set_menu(Some(menu))?;
            tray.set_tooltip(Some("Qdrin - Pomodoro Timer"))?;

            // Handle tray menu events
            tray.on_menu_event(move |app, event| match event.id().as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "hide" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            });

            // Handle tray icon click (show window)
            tray.on_tray_icon_event(|tray, event| {
                if let tauri::tray::TrayIconEvent::Click { .. } = event {
                    if let Some(app) = tray.app_handle().get_webview_window("main") {
                        let _ = app.show();
                        let _ = app.set_focus();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
