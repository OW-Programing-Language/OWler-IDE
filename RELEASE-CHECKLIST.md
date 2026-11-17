# Owler IDE — release acceptance checklist

Owler is intended to be a real, distributable OW development environment. A source archive alone is **not** a finished installer. A release must meet every gate below.

## CI build gates (automated)

- [ ] `npm install` completes on Windows, macOS and Linux.
- [ ] `npm test` passes, including TypeScript syntax and command wiring.
- [ ] `npm run bundle:ow` builds the pinned OW compiler and stages the full JDK; optional Zig is staged on Windows.
- [ ] `OW_JAR=vendor/ow/OwIDE.jar npm run test:integration` checks all OW starters, executes a real console program, and queries a real Night HTTP endpoint.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes path-security, diagnostic and CLI tests.
- [ ] `npm run tauri build` passes on Windows; `.exe` (NSIS) and `.msi` exist in the build artifacts.
- [ ] macOS `.dmg` and Linux `.deb`/`.AppImage` builds pass on their own runners.

## Windows end-user gates (manual, essential)

- [ ] Fresh Windows 11 VM without Java or OW preinstalled: Owler setup launches without a developer environment.
- [ ] OW toolchain is reported available; all bundled resources resolve under the installed application directory.
- [ ] Create a console project. Check and Run work; output appears in terminal. Build native works with Zig.
- [ ] Create Night web project. Run, preview `http://127.0.0.1:8080/`, and inspect `/api/health`.
- [ ] Package a self-contained OW web app and run its resulting launcher without an external JDK.
- [ ] Open folder, create/save/rename/delete files, multi-tab editing, completion and go-to-definition work.
- [ ] Deliberately break OW syntax and confirm error marker with line navigation.
- [ ] Git clone, stage, diff, commit, pull and push against a disposable test repository all work.
- [ ] GitHub CLI login, PR list/create and repository publish work with organization permissions.
- [ ] Claude Code and Codex sessions launch if installed, display ANSI output, accept input and stop cleanly.
- [ ] No API tokens are embedded in the bundle or persisted by Owler.

## Shipping an auto-update (in-app "Check for updates")

Owler checks `https://github.com/OW-Programing-Language/OWler-IDE/releases/latest/download/latest.json`
and installs signed NSIS updates in place (old version replaced, app relaunched).

One-time setup (already done): a minisign keypair was generated at `~/.owler-updater.key`
(+ `.pub`). The **public** key is embedded in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
The **private** key must be kept secret — store it as the CI secret `TAURI_SIGNING_PRIVATE_KEY`
(and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if set). Losing it breaks all future updates.

Per release:
- [ ] Bump `version` in `src-tauri/tauri.conf.json` **and** `package.json`.
- [ ] Signed build: `TAURI_SIGNING_PRIVATE_KEY=~/.owler-updater.key TAURI_SIGNING_PRIVATE_KEY_PASSWORD= npm run tauri -- build`
      (produces `…_x64-setup.exe` and its `.sig`).
- [ ] `npm run make-latest -- "release notes"` to generate `latest.json`.
- [ ] Publish a GitHub release tagged `v<version>` with the setup.exe **and** latest.json attached
      (the `gh release create …` command is printed by make-latest).
- [ ] From an older installed build, confirm the status-bar version button / Tools → Check for updates
      finds the new version, installs, and relaunches.

## Currently not verified

No Windows, macOS or Linux installer was compiled or manually exercised in this session: the working environment lacks Rust/Cargo and cannot resolve package-registry hosts. Completing CI and VM testing is mandatory before calling this a production release. The GitHub repository must first exist under `OW-Programing-Language` for Actions to run.
