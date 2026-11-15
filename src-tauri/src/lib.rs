use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// The currently registered quick-chat hotkey.
/// Alt+Space is reserved by Windows (window menu) and PowerToys Run, so we default to Ctrl+Shift+Space.
struct QuickShortcut(Mutex<Shortcut>);

fn default_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn toggle_quick(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("quick") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.center();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

const KEYRING_SERVICE: &str = "com.myai.desktop";
const KEYRING_USER: &str = "gemini_api_key";

fn key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

/// Reads the user's Gemini key from Windows Credential Manager (None if not set yet).
#[tauri::command]
fn get_api_key() -> Result<Option<String>, String> {
    match key_entry()?.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_api_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() || key.len() > 512 {
        return Err("Invalid key".into());
    }
    key_entry()?.set_password(key).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_api_key() -> Result<(), String> {
    match key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Called from Settings. Registers the new hotkey first so the old one stays active if it fails.
#[tauri::command]
fn set_quick_shortcut(
    app: AppHandle,
    state: State<'_, QuickShortcut>,
    accelerator: String,
) -> Result<(), String> {
    let new: Shortcut = accelerator
        .parse()
        .map_err(|e| format!("Invalid shortcut: {e}"))?;
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    if *current == new {
        return Ok(());
    }
    let gs = app.global_shortcut();
    gs.register(new).map_err(|e| e.to_string())?;
    let _ = gs.unregister(*current);
    *current = new;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: launching MyAI again just focuses the running instance.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app)
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                // Only one shortcut is ever registered, so any press toggles the quick window.
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_quick(app);
                    }
                })
                .build(),
        )
        .manage(QuickShortcut(Mutex::new(default_shortcut())))
        .invoke_handler(tauri::generate_handler![
            set_quick_shortcut,
            get_api_key,
            set_api_key,
            delete_api_key
        ])
        .setup(|app| {
            if let Err(e) = app.global_shortcut().register(default_shortcut()) {
                eprintln!("Global shortcut unavailable (used by another app?): {e}");
            }

            // System tray: the app keeps running in the background so the hotkey stays alive.
            let open = MenuItem::with_id(app, "open", "Open MyAI", true, None::<&str>)?;
            let quick = MenuItem::with_id(app, "quick", "Quick chat", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quick, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("MyAI")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_main(app),
                    "quick" => toggle_quick(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing the main window hides it to the tray instead of quitting.
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                api.prevent_close();
                let _ = window.hide();
            }
            // Quick window behaves like Spotlight: disappears when it loses focus.
            WindowEvent::Focused(false) if window.label() == "quick" => {
                let _ = window.hide();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running MyAI");
}
