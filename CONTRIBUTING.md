# Contributing

PDF Studio is a personal project, but changes are welcome.

1. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (at least §0 and §13) and [`DESIGN.md`](DESIGN.md).
2. Set up your machine with [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).
3. Keep to the boundaries: MuPDF only in `src/engine/`, Tauri only in `src/platform/`, coordinate maths only in `src/lib/coords.ts`. ESLint checks the first two.
4. Every change to a document is a `Command` in `src/engine/api.ts`, applied in `applyCommand()` and covered by a test in `tests/engine.test.ts`, including undo.
5. UI follows `DESIGN.md`: tokens from `src/styles/tokens.css` (no raw colours), the shared `Button`/`IconButton`, buttons named with a verb and an object.
6. Before committing: `npm run check` (plus `npm run check:rust` for Rust changes), bump the version, add a `CHANGELOG.md` entry. See [`docs/VERSIONING.md`](docs/VERSIONING.md).

By contributing you agree that your contribution is licensed under the project's licence, [AGPL-3.0-or-later](LICENSE).
