# Versioning

PDF Studio uses [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH[-PRERELEASE]`.

## Rules during pre-alpha

1. The first build was **`1.0.0-pre-alpha`**.
2. **Every commit bumps the patch number by one** and keeps the `-pre-alpha` tag: `1.0.1-pre-alpha`, `1.0.2-pre-alpha`, …
3. The version lives in five files, and they must always agree:
   - `package.json` and `package-lock.json`
   - `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`
   - `src-tauri/tauri.conf.json`
4. Never edit those by hand. Run:

   ```bash
   npm run version:bump                  # next patch, e.g. 1.0.4-pre-alpha -> 1.0.5-pre-alpha
   npm run version:bump -- 1.1.0-alpha   # set an exact version
   node scripts/bump-version.mjs --check # fails if the files disagree (CI runs this)
   ```

5. Each commit adds its own section to [`CHANGELOG.md`](../CHANGELOG.md) under the new version.
6. The commit subject starts with the version: `1.0.5-pre-alpha: Add page thumbnails`.

## Leaving pre-alpha

The pre-release tag changes when the app's quality does, not on a schedule:

| Stage       | Meaning                                            | Example            |
| ----------- | -------------------------------------------------- | ------------------ |
| `pre-alpha` | Features being built; may lose work                | `1.0.12-pre-alpha` |
| `alpha`     | Phase 1 feature-complete; used daily by the author | `1.1.0-alpha`      |
| `beta`      | Phase 2 complete; shared with friends              | `1.2.0-beta`       |
| _(none)_    | Stable                                             | `1.2.0`            |

At each stage change, use the explicit form of `version:bump`.

## Why the installer is NSIS only

Windows MSI installers (WiX) only accept numeric pre-release tags (`1.0.0-1`), so a version like `1.0.3-pre-alpha` can't be packaged as an MSI. NSIS `.exe` installers have no such limit, and they're the better fit anyway (per-user install, no admin rights needed).
