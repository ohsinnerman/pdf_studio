# Releasing

How the Windows `.exe` gets built, and how to publish one.

## Two ways to get an installer

### 1. From any CI run (no release needed)

Every push runs **CI** (`.github/workflows/ci.yml`):

```
Web checks (Linux) ─┐
                    ├─► Windows installer ─► artifact: pdf-studio-<version>-windows-x64
Rust checks (Win)  ─┘
```

When the run finishes, open it in the **Actions** tab → **Artifacts** → download the zip, which contains `PDF Studio_<version>_x64-setup.exe`. Artifacts are kept for 30 days. Use this to try a build on your PC or give it to a friend.

### 2. A GitHub Release (for versions you want to keep)

**Release** (`.github/workflows/release.yml`) runs when you push a tag that starts with `v`:

1. Make sure everything is committed and CI is green.
2. Tag the commit with **exactly** its version (the workflow refuses a mismatch):

   ```powershell
   $v = node -p "require('./package.json').version"
   git tag "v$v"
   git push origin "v$v"
   ```

3. The workflow checks that every version file agrees, runs the tests, builds the installer with `tauri-action`, and creates a **draft** release named `PDF Studio v<version>` with the `.exe` attached.
4. On GitHub → **Releases**, open the draft, check the notes, and press **Publish**. Nothing is public until you do.

Versions with a pre-release tag (`1.0.9-pre-alpha`) are marked **pre-release** automatically.

You can also start **Release** by hand from the Actions tab (`workflow_dispatch`). It then uses the version in `package.json` for the tag name.

## What's in the installer

- **NSIS** `.exe`, per-user install (no admin rights), Start-menu shortcut, uninstaller.
- **WebView2:** if it's missing, the installer downloads Microsoft's bootstrapper. To install on a PC with no internet, switch `bundle.windows.webviewInstallMode` in `src-tauri/tauri.conf.json` to `embedBootstrapper`.
- **No MSI.** MSI only allows numeric pre-release versions; see [VERSIONING.md](VERSIONING.md#why-the-installer-is-nsis-only).

## Not done yet (deliberately)

|                      | Why not                                                                                  | When                            |
| -------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| Code signing         | Certificates cost money every year; for personal use, SmartScreen's "Run anyway" is fine | If the app is shared widely     |
| Auto-update          | Would be the app's only network access; needs signing keys                               | Phase 2 at the earliest, opt-in |
| macOS / Linux builds | Not needed; Tauri makes them a small CI change later                                     | On request                      |

## Checklist before tagging

- [ ] `npm run check` and `npm run check:rust` pass
- [ ] `CHANGELOG.md` has a section for this version
- [ ] Installed the CI artifact on Windows and opened, edited and saved a real PDF
- [ ] `node scripts/bump-version.mjs --check` prints the version you are about to tag
