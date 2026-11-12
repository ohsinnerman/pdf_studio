# Development

How to set up, run, test and debug PDF Studio on Windows.

## 1. One-time setup

| Tool                          | Version        | How                                                                                                                                                                                                 |
| ----------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js**                   | 22.12 or newer | [nodejs.org](https://nodejs.org) (LTS installer) or `winget install OpenJS.NodeJS.LTS`                                                                                                              |
| **Rust**                      | stable         | [rustup.rs](https://rustup.rs): run `rustup-init.exe` and accept the defaults (MSVC toolchain)                                                                                                      |
| **Microsoft C++ Build Tools** | 2022           | [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/): tick **"Desktop development with C++"**. Rust needs the MSVC linker.                                       |
| **WebView2**                  | any            | Already on Windows 11 and on almost every Windows 10 machine. If `npm run app:dev` opens a blank window, install the [Evergreen runtime](https://developer.microsoft.com/microsoft-edge/webview2/). |

Then, in the project folder:

```powershell
npm install
```

The first Rust build downloads and compiles about 400 crates, which takes 3–6 minutes. Later builds take seconds.

**Editor:** VS Code with the extensions recommended in `.vscode/extensions.json` (rust-analyzer, Tauri, ESLint, Prettier). VS Code suggests them when you open the folder.

## 2. Running

| Command             | What it does                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run app:dev`   | **The desktop app** with hot reload. Frontend changes appear instantly; Rust changes rebuild and restart the window.                                |
| `npm run dev`       | The UI alone in your browser at http://localhost:1420, using the browser platform: Open uses a file picker and Save downloads. Fastest for UI work. |
| `npm run app:build` | Release build. The installer lands in `src-tauri\target\release\bundle\nsis\PDF Studio_<version>_x64-setup.exe`.                                    |

In the browser build there are no file paths, so **Save always behaves like Save As** (it downloads). Everything else, including the MuPDF engine, works the same.

## 3. Checks

```powershell
npm run check        # typecheck + ESLint + Prettier + tests + version check (what CI's "Web checks" runs)
npm run check:rust   # rustfmt + clippy (warnings are errors) + Rust tests
npm run format       # fix formatting
npm run test:watch   # re-run tests as you edit
```

CI runs the same commands (see [RELEASING.md](RELEASING.md)), so a green `check` locally means a green CI run.

### What the tests cover

| Area                  | File                                      | How                                                                                                                                                                |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Coordinates           | `src/lib/coords.test.ts`                  | Every rotation, zoom and DPR case                                                                                                                                  |
| Engine                | `tests/engine.test.ts`                    | Real MuPDF in Node, on PDFs generated per test (`tests/fixtures/make-pdf.ts`): open, passwords, render, every command, undo/redo across saves, saving              |
| Text editing          | `tests/text-edit.test.ts`                 | Line detection, font matching, replace/delete a line, neighbours intact, refusals, undo, save/reopen, rotated pages, a real Chromium PDF                           |
| Annotations and forms | `tests/annotations.test.ts`               | Every annotation kind, ids that survive save/replay, move/resize/restyle/delete, undo, cover vs real redaction, flatten, filling forms (`tests/fixtures/form.pdf`) |
| Render pipeline       | `src/render/render.test.ts`               | LRU eviction, priority, cancellation, de-duplication, stale results                                                                                                |
| Selection, reorder    | `src/features/thumbnails/reorder.test.ts` | Pure functions behind clicks and drag-and-drop                                                                                                                     |
| Atomic save           | `src-tauri/src/save.rs`                   | Create, replace, failure leaves the original untouched, no leftover temp files                                                                                     |

## 4. Where things are

```
src/
  engine/        PDF engine. The ONLY code that imports mupdf.
    api.ts         The contract: commands, page info, errors (plain data).
    mupdf/         The MuPDF implementation (synchronous; runs in the worker).
    worker.ts      Worker entry: exposes the engine via Comlink.
    client.ts      UI side: starts the worker, waits for "ready", maps errors.
  platform/      OS access. The ONLY code that imports @tauri-apps/*.
    tauri.ts       Desktop: dialogs, file reads, save_atomic, window title, close guard.
    browser.ts     Browser fallback for `npm run dev`.
  render/        Render scheduler + bitmap cache + the usePageBitmap hook.
  state/         Zustand store, actions (every state change), keyboard shortcuts.
  features/      UI by feature: viewer, thumbnails, open, status, empty,
                 edit-text (Edit text tool), annotate (tools bar, page overlay, dialogs), forms.
  components/    Shared UI: Button, IconButton, Toolbar, Notices, Dialog styles.
  lib/           coords.ts (all coordinate maths), useDevicePixelRatio.
  styles/        tokens.css (mirror of DESIGN.md) and base.css.
src-tauri/
  src/lib.rs     Plugin setup + the save_atomic command.
  src/save.rs    Atomic write (temp file, fsync, rename, retry).
  capabilities/  What the frontend is allowed to do (least privilege).
  tauri.conf.json  Window, CSP, installer settings.
tests/           Engine tests and PDF fixtures.
scripts/         bump-version.mjs.
docs/            Architecture, decisions, development, releasing, versioning.
DESIGN.md        Design system (tokens, components, motion, copy).
```

ESLint enforces the two "ONLY" rules above. Importing `mupdf` outside `src/engine/`, or Tauri outside `src/platform/`, fails `npm run lint`.

## 5. Making a change

1. Work on a branch: `git switch -c my-change`.
2. Make the change and run `npm run check` (plus `npm run check:rust` if you touched `src-tauri`).
3. Bump the version: `npm run version:bump`. Every commit bumps the patch number ([VERSIONING.md](VERSIONING.md)).
4. Add a section for the new version at the top of `CHANGELOG.md`.
5. Commit with the version first in the subject: `1.0.10-pre-alpha: Add page search`.

## 6. Debugging

- **Frontend:** in `npm run app:dev`, right-click → **Inspect** opens the WebView2 DevTools (debug builds only).
- **The engine worker:** in DevTools → **Sources**, the worker shows up as `pdf-engine`. Breakpoints work there. Engine errors reach the UI with a code (`not-a-pdf`, `invalid-command`, …), see `src/engine/api.ts`.
- **Rust:** `println!`/`eprintln!` output appears in the terminal running `npm run app:dev`.
- **A PDF that renders wrongly:** reproduce it in a test. Add a case to `tests/engine.test.ts` that opens the file (keep real-world samples in `tests/fixtures/`, see `.gitattributes`), then render and assert.

## 7. Troubleshooting

| Symptom                                                 | Fix                                                                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Port 1420 is already in use`                           | Another `npm run dev`/`app:dev` is still running. Close it, or find it with `netstat -ano \| findstr 1420` and end it in Task Manager. |
| `link.exe not found` or `MSVC` errors                   | Install the C++ Build Tools (section 1), then open a new terminal.                                                                     |
| Blank window in `app:dev`                               | Install the WebView2 runtime (section 1).                                                                                              |
| Saving fails with "permission denied" on OneDrive files | OneDrive or antivirus held the file. The app already retries for about 3 seconds. Keep test PDFs outside OneDrive.                     |
| Windows SmartScreen blocks the installer                | It's unsigned (personal project). Choose **More info → Run anyway**.                                                                   |
| `cargo` very slow the first time                        | Normal: 3–6 minutes once, then cached in `src-tauri/target`.                                                                           |
| Rust build fails after `git pull`                       | `cd src-tauri` then `cargo clean`, and build again.                                                                                    |
