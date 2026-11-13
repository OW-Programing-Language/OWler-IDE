# Owler IDE 🦉

**A native desktop IDE built for the OW programming language.**

Owler combines a Rust/Tauri 2 native backend with a fast React/TypeScript frontend and a Monaco editor. Open existing OW projects or create new applications, use the real OW toolchain to check, run and compile code, package Night web apps, and work with GitHub and AI CLIs without leaving the editor.

> **Release status:** This repository contains Owler IDE's expanded desktop application source and an automated installer pipeline. It is **not yet a verified installable release**: the native Rust/Tauri executable must pass a real build and runtime smoke test on Windows. Do not distribute it as production-ready until the CI checks and on-device test are green. The source is published at https://github.com/OW-Programing-Language/OWler-IDE.

## What you can do

| Area | Capabilities |
|------|--------------|
| Editing | Monaco editor, OW highlighting, snippets, local/open-file symbol completion and go-to-definition, hover documentation, document symbols, compiler Problems markers, minimap, multi-tabs, save shortcuts |
| Projects | Open folder, create OW console / Night web / interactive UI starter, create/rename/delete files and folders, directory explorer, outline, quick-open command palette |
| OW language | `ow check`, `ow run`, `ow build`, `ow package` for `web`, `gui`, `console`, integrated output in terminal |
| Web apps | Night starter with routes, REST JSON and persistent OW models; localhost web preview, `serve: 8080` and runtime packaging |
| Git | Initialize, stage, unstage, commit, diff viewer, pull (`--ff-only`), push, fetch, branch actions, clone, history and remotes |
| GitHub | Clone HTTPS/SSH, publish to **OW-Programing-Language**, list/create pull requests using `gh`, use local Git credentials |
| AI terminals | Resizable pseudo-terminals for shell, Claude Code, Codex, Gemini CLI, Aider and OpenCode; launch locally installed CLIs |
| Distribution | Tauri packaging, icons, Windows `.exe`/`.msi`, macOS `.dmg`, Linux `.deb`/`.AppImage`, GitHub Actions workflow |
| Bundled OW | Installer build clones **pinned OW compiler source**, packages `OwIDE.jar` and **a full JDK**; optional Zig on Windows for native builds |

## Download the source and run locally

Prerequisites for development:
- Node.js 22+
- Rust stable + [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/)
- Git
- OW on PATH during development, or set `OWLER_OW_BIN` to your OW CLI executable. The bundled toolchain is produced by `npm run bundle:ow`.

```bash
npm install
npm run desktop
```

On Windows, double-click `start-owler.bat` to start the development app. A browser-only frontend preview is available with `npm run dev`, **but browser mode cannot read/write files, compile OW, or run Git commands.**

## Build installers with a working compiler included

The release build intentionally uses the latest OW **at a pinned source commit** rather than the older prebuilt `v1.2.2` release. The compiler revision is recorded in `scripts/bundle-ow.mjs` and `vendor/ow/toolchain.json` during packaging.

Prerequisites for bundling: full **JDK 21** with `jpackage`, Maven, Git, Node, Rust/Tauri prerequisites. Set `JAVA_HOME` to the JDK folder. Windows native compiler can be bundled with Zig by setting `OW_BUNDLE_ZIG=1`.

```bash
npm install
npm run bundle:ow              # stages OW jar + JDK at vendor/ow
npm run tauri build           # builds platform-specific installer
```

On Windows, the shortcut is `build-windows.bat`. The scripted installer builds in `.github/workflows/build.yml` can be triggered on GitHub using **Actions → Owler IDE installers → Run workflow**, through an automatic main-branch build, or by pushing a version tag.

The resulting files are placed in `src-tauri/target/release/bundle/`. These are not produced by simply downloading the source ZIP.

**Automated release gates:** the GitHub Actions pipeline now runs frontend source tests, Rust unit tests, and **real OW compiler and Night HTTP runtime tests** before building installers. For a complete Windows release, download the `.exe`/`.msi` from a successful run's artifacts, install on Windows, create an OW project, run Check/Run/Build/Web app, and verify GitHub push/pull plus AI terminals. No such end-to-end test has been performed in this environment.

**Why bundle the full JDK?** OW `ow package` uses `jpackage` to produce distributable apps, so shipping only a JRE would break web and GUI packaging. The JDK travels inside the Owler installer, along with the OW compiler. The Windows CI pipeline also stages Zig for `ow build`. On macOS/Linux, native OW builds depend on an available compatible LLVM/Clang installation. OW's actual native backend is still a subset of its interpreter language. See [OW Compiler](https://github.com/OW-Programing-Language/ow-lang) for current coverage and limits.

### Build and run an OW or Night project

Use the toolbar `Check`, `Build`, `Web app` or `Run OW`. The command output appears in the embedded terminal. Direct equivalent CLI commands are:

```bash
ow check src/main.ow
ow run src/main.ow
ow build src/main.ow
ow package src/main.ow --name MyNightApp --type web --out dist
```

`ow build` produces native binaries only for constructs supported by OW's LLVM compiler. `ow package --type web` packages a runnable OW web application with its own runtime; **it does not turn Java web code into a completely native LLVM executable**. Night's routing, model persistence and web server are provided by the OW language runtime.

### GitHub and credentials

Owler delegates Git authentication to **your local Git installation** and Git Credential Manager/SSH agent. Owler does not ask for, store or embed your GitHub token.

For creating a new repository under the OW organization from inside Owler, install [GitHub CLI](https://cli.github.com/) and authenticate:

```bash
gh auth login
```

Commit the initial project files and click **Source Control → Publish new repo to GitHub**. The app calls a narrowly scoped `gh repo create OW-Programing-Language/<name> --source . --remote origin --push` command after confirmation. The GitHub account must have permission to create repos in that organization.

To publish **this IDE itself**, create `OW-Programing-Language/Owler-IDE` using GitHub or `gh` and run the following from the unzipped project:

```bash
git init -b main
git add .
git commit -m "feat: initial Owler IDE Tauri workspace"
gh repo create OW-Programing-Language/Owler-IDE --public --source . --remote origin --push
```

If the repository already exists, use `git remote add origin https://github.com/OW-Programing-Language/Owler-IDE.git` followed by `git push -u origin main` instead.

## AI agent terminal support

The Claude Code, Codex CLI, Gemini CLI, Aider and OpenCode tabs run locally installed `claude`, `codex`, `gemini`, `aider` and `opencode` commands via real PTYs. These tools are *not silently downloaded or authenticated for you*; install each CLI and sign in normally. All processes run in the chosen workspace directory and can use its files, exactly like in an external terminal. You can open multiple sessions and run any other compatible CLI through **System shell**. The Tools tab detects installed CLI executables.

## Keyboard shortcuts

| Shortcut | Action |
|----|----|
| `Ctrl/Cmd + P` | Quick open / command palette |
| `Ctrl/Cmd + Shift + P` | Command palette |
| `Ctrl/Cmd + S` | Save all modified tabs |
| `Ctrl/Cmd + \`` | Toggle terminal |
| `F5` | Run active OW file |
| `Ctrl + Enter` while writing commit message | Commit staged changes |

## Security notes

- Native file commands reject paths that escape the workspace, including `..` traversal and symlinks outside it.
- Git operations are executed as fixed `git` subcommands with argument arrays: no user-provided string is evaluated by a shell.
- GitHub operations rely on the user's existing Git credentials and `gh` session; no token storage.
- The terminal intentionally gives local shell / AI CLIs the same privileges they would have in your normal terminal. Only run code you trust and review agent permissions.
- Project deletion requires confirmation in the UI.
- Bundled JDK and optional Zig significantly increase installer size. Respect their licenses and verify binaries in the CI release workflow.

## Technical architecture

```
Owler-IDE/
├── src/
│   ├── App.tsx                 # workspace, source control, palette, UI
│   ├── components/
│   │   ├── EditorPane.tsx      # Monaco multi-file editor
│   │   └── TerminalPanel.tsx   # xterm.js terminal sessions
│   ├── lib/
│   │   ├── api.ts              # strongly typed Tauri invoke bridge
│   │   └── owLanguage.ts       # syntax colors, tokens and snippets
│   └── styles.css             # native dark IDE design system
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # Tauri state/commands
│   │   ├── workspace.rs        # safe project I/O + scaffold templates
│   │   ├── git.rs              # Git/GitHub CLI integration
│   │   ├── terminal.rs         # portable pseudo-terminals
│   │   └── ow.rs               # OW/JDK runtime discovery
│   ├── templates/             # OW console, Night web, interactive UI
│   └── tauri.conf.json        # app and installer config
├── scripts/bundle-ow.mjs     # stage pinned OW compiler and JDK
├── .github/workflows/build.yml
└── build-windows.bat
```

### Current scope / known limitations

This is a substantial first version, **not yet a production-tested VS Code replacement**. It includes lightweight OW symbol completion, definitions across currently open files and compiler diagnostic markers, but not a compiler-backed Language Server Protocol, semantic whole-workspace navigation, incremental analysis, integrated step debugger, or full type inference. OW's own compiler controls which programs can be compiled natively. The frontend and Rust backend have not yet been compiled together in this environment (no Rust toolchain or package-registry access). The structural/TypeScript-syntax tests pass locally; actual Rust, OW runtime and installer checks run only on a connected build runner. **Do not claim a working setup.exe until those have passed.**

The organization URL is intentionally spelled as the actual GitHub account: **`OW-Programing-Language`**.

## License

MIT for Owler source (see `LICENSE`). OW and the bundled JDK/Zig have their own licenses; the bundling script retains source license notices.
