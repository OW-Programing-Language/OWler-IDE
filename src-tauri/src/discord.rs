// Discord Rich Presence: shows "Playing OWler IDE" with a line like
// "Editing main.ow" while the user works. Connection is best-effort — if Discord
// isn't running (or no app id is configured) every call is a silent no-op.
use std::time::{SystemTime, UNIX_EPOCH};
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::State;
use crate::AppState;

// The "Playing <name>" line is the Discord application's own name, so to show
// "OWler IDE" you create a Discord application named exactly that at
// https://discord.com/developers/applications and set its id here (or via the
// OWLER_DISCORD_APP_ID env var). The placeholder below simply shows nothing.
const DEFAULT_APP_ID: &str = "1571909248148045884";

pub struct Discord { pub client: Option<DiscordIpcClient>, pub start: i64 }
impl Default for Discord { fn default() -> Self { Discord { client: None, start: 0 } } }

// The logo shown on the card. Either an art-asset KEY uploaded under the Discord
// application's Rich Presence → Art Assets (default "owler"), or a full https URL
// to a PNG, which Discord proxies — set OWLER_DISCORD_IMAGE to override.
const DEFAULT_IMAGE: &str = "owler";

fn now() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0) }
fn app_id() -> String { std::env::var("OWLER_DISCORD_APP_ID").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| DEFAULT_APP_ID.into()) }
fn image() -> String { std::env::var("OWLER_DISCORD_IMAGE").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| DEFAULT_IMAGE.into()) }

/// Update the presence. `details` is the main line (e.g. "Editing main.ow") and
/// `state_line` the secondary line (e.g. the project name).
#[tauri::command]
pub fn discord_activity(details: Option<String>, state_line: Option<String>, state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.discord.lock().map_err(|e| e.to_string())?;
    if guard.client.is_none() {
        let mut c = match DiscordIpcClient::new(&app_id()) { Ok(c) => c, Err(_) => return Ok(()) };
        if c.connect().is_err() { return Ok(()); } // Discord not open — ignore quietly.
        guard.client = Some(c);
        guard.start = now();
    }
    let start = guard.start;
    let details = details.unwrap_or_else(|| "Idle".into());
    let image = image();
    if let Some(c) = guard.client.as_mut() {
        let mut act = activity::Activity::new()
            .details(&details)
            .assets(activity::Assets::new().large_image(&image).large_text("OWler IDE"))
            .timestamps(activity::Timestamps::new().start(start));
        if let Some(s) = state_line.as_deref().filter(|s| !s.is_empty()) { act = act.state(s); }
        // A failed update usually means Discord was closed; drop the client so the
        // next call reconnects.
        if c.set_activity(act).is_err() { guard.client = None; }
    }
    Ok(())
}

/// Clear the presence (e.g. on shutdown or when disabled).
#[tauri::command]
pub fn discord_clear(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.discord.lock().map_err(|e| e.to_string())?;
    if let Some(c) = guard.client.as_mut() { let _ = c.clear_activity(); }
    Ok(())
}
