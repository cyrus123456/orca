> [全局规则引用] c:\Users\73476\.config\opencode\AGENTS.md

# Project Overview

Orca is an Electron desktop app that orchestrates CLI coding agents (Claude Code, Codex, OpenCode, etc.) across parallel git worktrees. It also has a mobile companion app (React Native/Expo) and a CLI (`orca`).

**Stack**: Electron 43 + electron-vite, React 19, Tailwind v4, shadcn (new-york-v4), zustand, vitest, oxlint, TypeScript 7

**Runtime**: Node 24, pnpm 10.24

# Developer Commands

```bash
pnpm install              # install deps (also runs postinstall: rebuild native deps)
pnpm dev                  # start Electron dev server (runs ensure:electron-runtime first)
pnpm dev:web              # web-only dev server (no Electron)

# Verification — run in this order before PRs:
pnpm lint                 # oxlint + switch-exhaustiveness + styled-scrollbars + reliability-gates + max-lines-ratchet + skill/localization checks
pnpm typecheck            # runs all 3: node + cli + web
pnpm test                 # vitest run (config/vitest.config.ts)
pnpm build                # full desktop build (typecheck → relay → cli → electron-vite → web → native)

# Focused commands:
pnpm typecheck:node       # main + preload + shared + relay + types
pnpm typecheck:cli        # CLI-specific
pnpm typecheck:web        # renderer + shared
pnpm test:e2e             # Playwright e2e (requires Electron runtime)
pnpm format               # oxfmt --write .
```

**Mobile app** (separate workspace in `mobile/`):
```bash
cd mobile && pnpm install && pnpm start   # Expo dev server
cd mobile && pnpm test                    # vitest run
```

# Architecture

```
src/
  main/       Electron main process (IPC, git, SSH, terminals, daemon, agent integrations)
  preload/    Electron preload (bridge API types — NO .d.ts files allowed here)
  renderer/   React UI (src/renderer/src/) — see path aliases below
  shared/     Code imported by both main and renderer (NO .d.ts files allowed here)
  relay/      WebSocket relay for SSH/remote worktree sessions
  cli/        `orca` CLI entrypoint and command handlers
  types/      Build-constant ambient declarations (only .d.ts allowed here)
```

**Path aliases** (renderer only):
- `@/` and `@renderer/` both resolve to `src/renderer/src/`

**Renderer structure**:
- `src/renderer/src/components/ui/` — shadcn primitives (canonical component source)
- `src/renderer/src/assets/main.css` — design tokens, Tailwind theme, all CSS
- `src/renderer/index.html` + `popout.html` — two HTML entrypoints (main window + pop-out dashboard)

**Build outputs**: `out/` (Electron main + CLI), `out/renderer/` (renderer bundle)

**Config**: all tsconfigs live in `config/`; vitest config is `config/vitest.config.ts`; electron-builder config is `config/electron-builder.config.cjs`

# Design System

All UI work — layout, color, typography, spacing, component selection, UX behavior — must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens defined in `src/renderer/src/assets/main.css` (the canonical source) and the shadcn primitives in `src/renderer/src/components/ui/`. Don't invent new color values, font sizes, or shadow tiers when a documented one already covers the role. When STYLEGUIDE.md is silent, follow the resolution order in its final section.

## Electron UI Validation

Always run tests and agent-launched apps in the background with `ORCA_BACKGROUND_LAUNCH=1`.
Never steal monitor focus or reveal test windows: no `show()`, `showInactive()`, `bringToFront()`,
`app.focus()`, or OS activation. Use CDP screenshots of hidden renderers. Keep native-focus and
visible-window tests paused on the user's desktop; run them on an isolated display or CI.
Rebuild modified launch-policy code before running an app; stale build wrappers are not safe.

Use the `$electron` skill and Playwright CDP for rendered Orca UI checks. Do not use computer-use for Orca UI validation.

# Style

## Concise/Brief Non-obvious comments ONLY
  * DO NOT: be verbose, explain the obvious, walk through the code ("WHY not HOW")
  * BE CONCISE. 1 LINE if possible

## Lint Rules: Do Not Disable Max Lines

NEVER add a `max-lines` disable (`eslint-disable max-lines`, `oxlint-disable max-lines`, or line-specific variants), and never add a per-file `max-lines` bump in `mobile/.oxlintrc.json`.

Oversized files are tracked in `config/max-lines-baseline.txt` — a ratchet that may only shrink. If a file exceeds the limit, split it; don't suppress the rule.

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff` for files, folders, or modules. They carry zero info and tend to become dumping grounds. Name files after what they _actually_ contain — prefer the concrete domain concept (e.g. `tab-group-state.ts`, `terminal-orphan-cleanup.ts`) over the generic role (`tabs-helpers.ts`, `terminal-utils.ts`). If you find yourself reaching for `helpers`, the file probably has more than one responsibility and should be split, or there's a better name hiding in the code that describes what the functions operate on.

## Type Declarations: Prefer `.ts` Over `.d.ts`

Project-owned type declarations belong in `.ts` files. `.d.ts` is reserved for ambient shims (e.g., `env.d.ts`, `vite/client.d.ts`). TypeScript's `skipLibCheck: true` silently widens unresolved names in `.d.ts` to `any`, which shipped a broken IPC signature past typecheck (see `docs/preload-typecheck-hole.md`). CI enforces: no `.d.ts` files in `src/preload/` or `src/shared/`.

## oxlint Rules

- `typescript/consistent-type-definitions`: use `type`, not `interface`
- `typescript/consistent-type-imports`: use `import type` for type-only imports
- `typescript/no-explicit-any`: error (except rest args)
- `typescript/switch-exhaustiveness-check`: error, no default case allowed
- `react/jsx-curly-brace-presence`: no unnecessary braces in props/children
- Max lines: 300 (.ts), 400 (.tsx), 600 (.mjs), 800 (test files)

# Considerations

## Worktree Safety

Always use the primary working directory (the worktree) for all file reads and edits. Never follow absolute paths from subagent results that point to the main repo.

## Cross-Platform Support

Orca targets macOS, Linux, and Windows. Keep all platform-dependent behavior behind runtime checks:

- **Keyboard shortcuts**: Never hardcode `e.metaKey`. Use a platform check (`navigator.userAgent.includes('Mac')`) to pick `metaKey` on Mac and `ctrlKey` on Linux/Windows. Electron menu accelerators should use `CmdOrCtrl`.
- **Shortcut labels in UI**: Display `⌘` / `⇧` on Mac and `Ctrl+` / `Shift+` on other platforms.
- **File paths**: Use `path.join` or Electron/Node path utilities — never assume `/` or `\`.
- **Windows setup scripts**: the setup/issue-command runner is a `.cmd` batch file unless the script starts with a `#!` line — never derive that from the user's terminal-shell preference, and never launch a `.cmd` runner with a bare `cmd.exe /c` from a Git Bash pane (MSYS rewrites the `/c`). See [`docs/reference/windows-setup-shell.md`](./docs/reference/windows-setup-shell.md).
- **Windows child processes**: start them through `runProcess`/`spawnProcess` in `src/shared/child-process/` — never `child_process` directly. It pins `windowsHide`, refuses `shell: true`, and encodes `.cmd`/`.bat` arguments so neither `CommandLineToArgvW` nor `cmd.exe` mangles them. A ratchet test fails on any new direct import. Recognised npm/pnpm `.cmd` shims are resolved to their real target so the spawn skips `cmd.exe` entirely; see [`docs/reference/windows-cmd-shim-resolution.md`](./docs/reference/windows-cmd-shim-resolution.md) before adding a shim shape or debugging one.
- **Windows process enumeration**: read the table through `src/main/windows/windows-process-table.ts`, never by forking `powershell.exe`. See [`docs/reference/windows-process-enumeration.md`](./docs/reference/windows-process-enumeration.md).
- **Windows daemon-host relocation**: the terminal daemon runs from a copy of the app runtime under `%LOCALAPPDATA%`, which is what survives an auto-update. Before touching that copy, its exe name, or the NSIS uninstall macro, read [`docs/reference/windows-daemon-host-relocation.md`](./docs/reference/windows-daemon-host-relocation.md).
- **Windows EDR signal**: don't add `-ExecutionPolicy Bypass`, `-EncodedCommand`, `cmd.exe /c` with escaped free text, per-operation interpreter spawning, or runtime `Add-Type` compilation without reading [`docs/reference/windows-edr-posture.md`](./docs/reference/windows-edr-posture.md) first — behavioural EDR scores each of those, and being signed does not clear them.
- **WSL commands**: build argv with `buildWslExecArgs` (always `--exec` — under `--`, `wsl.exe` expands `$name` in every argument and silently rewrites the script), and fence anything whose stdout you parse with `buildWslCapturedLoginShellCommand`, because the interactive login shell prints the distro banner to stdout. See [`docs/reference/wsl-command-execution.md`](./docs/reference/wsl-command-execution.md).
- **Linux native modules**: keep the glibc floor at Ubuntu 20.04 / glibc 2.31. A module compiled from source on a newer runner can reference symbol versions absent on the floor and crash the app on startup. See [`docs/reference/linux-glibc-compatibility.md`](./docs/reference/linux-glibc-compatibility.md); packaging fails if a bundled native binary needs newer glibc.

## SSH Use Case

All changes must consider the SSH use case. Don't assume local-only execution. Before changing anything that reports on, stops, or lists remote work, follow [`docs/reference/ssh-execution-boundary.md`](./docs/reference/ssh-execution-boundary.md): the execution host owns everything that touches execution, and loss of contact is never evidence of process death — the verdict vocabulary is `live` / `unverifiable` / `exited`, with no synonyms.

## Folder Workspace Use Case

All changes must consider folder workspaces as well as git worktrees. Don't assume every workspace is a git worktree.

## Remote Wire Compatibility

Clients and remote Orca servers update independently, so mixed versions are the normal state. Before changing anything a paired client and host exchange — RPC params, stream frames, or the content either side publishes over them — follow [`docs/reference/remote-wire-compatibility.md`](./docs/reference/remote-wire-compatibility.md). A new optional field is safe; a new stream opcode must be capability-negotiated because decoders drop unknown opcodes silently; and changing what the host publishes reaches old clients even with no wire change.

## Git Binary Compatibility

Orca runs the user's Git binary on native, WSL, and SSH hosts, which may all have different versions. Treat Git 2.25 as the core-workflow baseline and follow [`docs/reference/git-compatibility.md`](./docs/reference/git-compatibility.md).

When adding or changing a Git command:

- Check when every subcommand and option was introduced. For newer behavior, keep a baseline-compatible fallback or degrade safely.
- Use `GitCapabilityCache` with a narrow unsupported-error predicate so recurring operations do not retry a known-invalid command. Do not rely only on `git --version`; wrappers such as `simple-git` do not remove host-version differences.
- Scope capability state to the host that executes Git: native, WSL distro, SSH provider, or relay connection. Cover the first fallback, later cached calls, concurrent probes, and relevant host isolation in tests.
- Keep the real-binary compatibility contract in PR CI current. When adopting a newer Git feature, add its version boundary so the preferred command and fallback both run against representative Git releases.
- Preserve commands that begin with global Git options such as `-c` before the subcommand, including auto-maintenance suppression used by worktree-create fetches.

## Git Scan Safety

- Never enumerate every ref and then run `git ls-tree -r` or `git show` once per ref. That ref × tree fan-out can retain gigabytes of output before a downstream `sort -u` or search can make progress.
- Prefer `rg` over the checked-out files for source searches. For history or refs, use a named ref, an explicit namespace/path, `--max-count`, and a bounded output; do not use an unqualified `--all` scan as a first diagnostic.
- Keep repository-wide commands targeted to the current repository and worktree. If an unbounded scan is genuinely required, measure the ref count first, explain the cost, and get confirmation before running it.

## Git Provider Compatibility

Source-control and review changes must consider GitLab and other supported git providers, not only GitHub. Keep provider-specific behavior behind explicit checks, and avoid GitHub-only naming for generic review concepts.

## GitHub CLI Usage

Be mindful of the user's `gh` CLI API rate limit — batch requests where possible and avoid unnecessary calls. All code, commands, and scripts must be compatible with macOS, Linux, and Windows.

# Build Quirks

- **Telemetry gate**: `ORCA_BUILD_IDENTITY` and `ORCA_POSTHOG_WRITE_KEY` are compile-time substitutions in `electron.vite.config.ts`. Non-CI builds resolve them to `null` (telemetry short-circuits). No runtime env-var fallback exists — you cannot spoof transmission with a shell export.
- **Daemon entry**: `src/main/daemon/daemon-entry.ts` is asar-unpacked for `child_process.fork()`. Pure-JS deps used by the daemon must be bundled (not externalized) because Node can't resolve into `app.asar` from the unpacked dir.
- **@xterm/headless resolve**: Vite can't resolve it via `exports: null` in package.json, so `electron.vite.config.ts` aliases it directly to the CJS main file.
- **Native deps**: `postinstall` runs `rebuild-native-deps.mjs` which rebuilds for Electron's ABI. For vitest (system Node), run `pnpm rebuild better-sqlite3` separately.
- **Pre-commit hook**: runs `lint-staged` → `oxlint` + `oxfmt --write` on staged `.ts/.tsx/.js/.mjs` and `oxfmt --write` on `.json/.css`.

# Testing

- **Unit tests**: `pnpm test` — vitest, config at `config/vitest.config.ts`. Test files: `src/**/*.test.ts(x)`, `config/scripts/**/*.test.ts`, `tools/**/*.test.mjs`
- **E2E tests**: `pnpm test:e2e` — Playwright with Electron, config at `tests/playwright.config.ts`
- **Windows**: vitest uses `maxWorkers: 4` on Windows due to slower process startup
- **Timeouts**: `hookTimeout: 60s`, `testTimeout: 30s` (heavy TS transforms + real git/http fixtures)
- **Git compat tests**: CI builds Git 2.25.5 from source and runs `git-binary-compatibility.test.ts` against it + Docker containers for 2.38.1 and 2.49.1

# Localization

- Catalog verification: `pnpm verify:localization-catalog`
- Coverage audit: `pnpm verify:localization-coverage`
- Fix/sync: `pnpm sync:localization-catalog`
- Bootstrap new locale: `pnpm bootstrap:locale-catalog` (or `--locale ko/ja/es`)
