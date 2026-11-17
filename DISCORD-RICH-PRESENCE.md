# Discord Rich Presence setup

Owler IDE can show your activity on Discord — e.g. **Playing OWler IDE** with a
line like **Editing main.ow** and the OWler logo. The IDE code is already wired
up; it just needs a Discord application so Discord knows the name and the logo.

## One-time setup

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **Name it exactly `OWler IDE`.** This name is what shows after "Playing …".
3. Copy the **Application ID** (General Information page).
4. Upload the logo so it appears on the card:
   - Open **Rich Presence → Art Assets → Add Image(s)**.
   - Upload the OWler logo (e.g. `src-tauri/icons/128x128@2x.png` or any square
     PNG ≥ 512×512 looks best).
   - Name the asset key **`owler`** (this is the key the IDE references).

## Point the IDE at your application

Set these environment variables before launching Owler (or add them to your
launch script / `.env`):

```
OWLER_DISCORD_APP_ID=<your Application ID>
# optional — override the logo:
#   an art-asset key (default "owler"), OR a full https URL to a PNG:
# OWLER_DISCORD_IMAGE=owler
# OWLER_DISCORD_IMAGE=https://raw.githubusercontent.com/OW-Programing-Language/OWler-IDE/main/src-tauri/icons/128x128@2x.png
```

Using an **https URL** for `OWLER_DISCORD_IMAGE` skips the Art-Assets upload —
Discord proxies the image — but you still need the app (step 1–3) for the
"Playing OWler IDE" name.

## Notes

- Presence is **best-effort**: if Discord isn't running, nothing happens (no
  errors). It reconnects automatically when Discord comes back.
- Toggle it any time in **Settings → Discord Rich Presence**.
- With no `OWLER_DISCORD_APP_ID` set, the built-in placeholder id shows no name
  or logo — so configuring your own application is required for the full card.
