use log::{error, info};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    AppHandle, Emitter, Manager, State, Wry,
};
use tauri_plugin_updater::UpdaterExt;
use warp::Filter;

mod app_status;
use app_status::{AppStatus, Status};

// Shared state for focus mode
#[derive(Clone)]
struct FocusState {
    is_focusing: Arc<Mutex<bool>>,
    is_timer_running: Arc<Mutex<bool>>,
    idle_reminder_enabled: Arc<Mutex<bool>>,
    idle_reminder_interval_minutes: Arc<Mutex<u64>>,
}

impl Default for FocusState {
    fn default() -> Self {
        Self {
            is_focusing: Arc::new(Mutex::new(false)),
            is_timer_running: Arc::new(Mutex::new(false)),
            idle_reminder_enabled: Arc::new(Mutex::new(true)),
            idle_reminder_interval_minutes: Arc::new(Mutex::new(10)),
        }
    }
}

#[tauri::command]
fn set_focus_state(state: State<'_, FocusState>, is_focusing: bool) {
    if let Ok(mut focus) = state.is_focusing.lock() {
        *focus = is_focusing;
    }
}

#[tauri::command]
fn set_timer_running(state: State<'_, FocusState>, is_running: bool) {
    if let Ok(mut running) = state.is_timer_running.lock() {
        *running = is_running;
    }
}

#[tauri::command]
fn set_idle_reminder_settings(state: State<'_, FocusState>, enabled: bool, interval_minutes: u64) {
    if let Ok(mut enabled_flag) = state.idle_reminder_enabled.lock() {
        *enabled_flag = enabled;
    }
    if let Ok(mut interval) = state.idle_reminder_interval_minutes.lock() {
        *interval = interval_minutes;
    }
}

#[tauri::command]
fn update_tray_title(app: tauri::AppHandle, title: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_title(Some(&title)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn app_status(state: State<'_, AppStatus>) -> Result<Status, String> {
    Ok(state.get().await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger
    env_logger::Builder::from_default_env()
        .format_timestamp_millis()
        .init();

    let focus_state = FocusState::default();
    let app_status_state = AppStatus::new();
    let focus_state_for_server = focus_state.clone();

    // Spawn HTTP server for browser extension communication
    tauri::async_runtime::spawn(async move {
        let state = focus_state_for_server;

        let status = warp::path("status").and(warp::get()).map(move || {
            let is_focusing = state.is_focusing.lock().unwrap_or_else(|e| e.into_inner());
            warp::reply::json(&serde_json::json!({
                "is_focusing": *is_focusing
            }))
        });

        let cors = warp::cors().allow_any_origin().allow_methods(vec!["GET"]);

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(focus_state)
        .manage(app_status_state.clone())
        .invoke_handler(tauri::generate_handler![
            set_focus_state,
            set_timer_running,
            set_idle_reminder_settings,
            update_tray_title,
            app_status
        ])
        .setup(|app| {
            // Create tray menu
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let tray = app.tray_by_id("main").unwrap();
            tray.set_menu(Some(menu))?;
            tray.set_tooltip(Some("Qdrin - Focus Timer"))?;

            // Handle tray menu events
            tray.on_menu_event(handle_menu_event);

            // Start updater
            let handle = app.app_handle().clone();
            let app_status = app.state::<AppStatus>();
            let status_clone = app_status.inner().clone();

            tauri::async_runtime::spawn(async move {
                info!("Starting update check...");
                update(handle, status_clone).await;
            });

            // Listen for app status updates and send to frontend
            let app_status = app.state::<AppStatus>();
            let app_handle = app.app_handle().clone();
            let status_clone = app_status.inner().clone();

            tauri::async_runtime::spawn(async move {
                let mut rx = status_clone.subscribe();
                while let Ok(status) = rx.recv().await {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.emit("app-status-changed", &status);
                    }
                }
            });

            // Spawn idle reminder loop
            let focus_state = app.state::<FocusState>();
            let focus_state_clone = focus_state.inner().clone();
            let app_handle = app.app_handle().clone();

            tauri::async_runtime::spawn(async move {
                info!("Idle reminder loop started");

                let mut idle_time_secs = 0u64;

                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

                    // Read idle reminder settings from state
                    let enabled = *focus_state_clone
                        .idle_reminder_enabled
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());

                    let interval_minutes = *focus_state_clone
                        .idle_reminder_interval_minutes
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());

                    info!("Idle reminder check: enabled={}, interval={} minutes, idle_time={} seconds",
                        enabled, interval_minutes, idle_time_secs);

                    // Skip if idle reminders are disabled
                    if !enabled {
                        idle_time_secs = 0;
                        continue;
                    }

                    let is_running = *focus_state_clone
                        .is_timer_running
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());

                    info!("Timer is_running: {}", is_running);

                    if is_running {
                        idle_time_secs = 0;
                        continue;
                    }

                    idle_time_secs += 60;

                    // Defensive default to avoid zero/negative interval
                    let threshold_secs = interval_minutes.max(1) * 60;

                    info!("Checking threshold: idle_time_secs={}, threshold_secs={}", idle_time_secs, threshold_secs);

                    // Show notification when idle time reaches threshold
                    if idle_time_secs >= threshold_secs {
                        idle_time_secs = 0;
                        info!("Attempting to show idle reminder notification");

                        // Emit event to frontend to show notification via webview Notification API
                        if let Some(window) = app_handle.get_webview_window("main") {
                            if let Err(e) = window.emit("show-idle-reminder", ()) {
                                error!("✗ Failed to emit idle reminder event: {}", e);
                            } else {
                                info!("✓ Idle reminder event emitted to frontend after {} minutes", interval_minutes.max(1));
                            }
                        } else {
                            error!("✗ Main window not found, cannot show idle reminder");
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn handle_menu_event(app: &AppHandle<Wry>, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
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
    }
}

async fn update(app: tauri::AppHandle, app_status: AppStatus) {
    app_status.update(Status::CheckingForUpdates).await;

    let Ok(updater) = app.updater() else {
        error!("Updater not configured");
        app_status
            .update(Status::Running {
                version: env!("CARGO_PKG_VERSION").to_string(),
            })
            .await;
        return;
    };

    if let Ok(Some(update)) = updater.check().await {
        let mut downloaded = 0;
        let mut progress = 0;

        info!("Update available: {}", update.version);

        let app_status_for_download = app_status.clone();

        let result = update
            .download_and_install(
                move |chunk_length, content_length| {
                    downloaded += chunk_length;

                    let new_progress = if let Some(total) = content_length {
                        ((downloaded as f64 / total as f64) * 100.0) as u8
                    } else {
                        0
                    };
                    let app_status_clone = app_status_for_download.clone();

                    if new_progress != progress {
                        progress = new_progress;
                        tokio::spawn(async move {
                            app_status_clone
                                .update(Status::DownloadingUpdate {
                                    progress: new_progress,
                                })
                                .await;
                        });
                    }
                },
                || {
                    info!("Download finished");
                },
            )
            .await;

        if let Err(e) = result {
            error!("Failed to download and install update: {e}");
            app_status
                .update(Status::Running {
                    version: env!("CARGO_PKG_VERSION").to_string(),
                })
                .await;
            return;
        } else {
            info!("Update installed");
        }
        app.restart();
    } else {
        info!("No update available");
        // No update available, set status to running
        app_status
            .update(Status::Running {
                version: env!("CARGO_PKG_VERSION").to_string(),
            })
            .await;
    }
}
