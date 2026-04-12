<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

Always ask questions before create proposal files if unsure about anything in these instructions or the spec file.

<!-- OPENSPEC:END -->

# PicGo-Core: Agent Notes

## Package Manager / Dependency Installation
- This repo uses `pnpm` (has `pnpm-lock.yaml`).
- If dependencies change, do not only edit `package.json`; run `pnpm install` to ensure deps + lockfile are consistent. Only run this when the user explicitly asks/coordinates it.
- In non-TTY environments, `pnpm install` may fail with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; use `CI=true pnpm install`. Only run this when the user explicitly asks/coordinates it.

## Code Conventions
- **Exports**: do not use `export default` for new/modified modules. Prefer named exports (e.g. `export { ServerManager }`) and named imports (e.g. `import { ServerManager } from '...'`).
- Keep TypeScript types explicit; avoid ad-hoc `any` when possible. Interface names do not require an `I` prefix.
- Don't write `as any` in TypeScript code unless absolutely necessary. Always prefer explicit types.
- **i18n / user-facing text**: do not hard-code user-facing strings (logs, errors, HTML result pages). Add i18n keys under `src/i18n/zh-CN.ts` and provide corresponding entries in `src/i18n/en.ts` and `src/i18n/zh-TW.ts`, then use `ctx.i18n.translate<ILocalesKey>(...)` (supports `${var}` placeholders via args). CLI option descriptions are exempt unless explicitly requested.
- **Commander actions**: prefer `.action(async (...) => { ... })` and avoid wrapping an IIFE like `.action(() => { (async () => { ... })().catch(...) })`.
- **No `void` fire-and-forget calls**: do not write `void someAsyncCall()` / `void somePromise.then(...)`. If a task is intentionally not awaited, keep the returned promise in a variable and attach explicit handling without using the `void` operator.
- **Cloud service error handling**: in service-layer code, never branch on `error.message` to decide behavior. Use HTTP status and backend error `code` instead, using specific `ApiErrorCode` values actually needed by PicGo-Core.
- **Commander prompts**: avoid `prompt<any>` / `prompt<IStringKeyMap<any>>`; declare a concrete answer type (e.g. `prompt<{ operation: 'list' | 'rename' }>(...)`).
- **Commander option descriptions**: for CLI options, use plain strings without i18n keys unless explicitly requested.
- **Commander alias/shortcut hints**: when a command is an alias or shortcut for another, include the relationship in the `.description()` string. For top-level shortcuts, use `(shortcut for cloud xxx)`; for canonical commands that have a shortcut, use `(alias: picgo xxx)`. Always put the simpler/shorter form first when listing alternatives in i18n strings or descriptions.
- **TypeScript enums**: when representing a fixed set of values, prefer `enum` over union string literal types unless explicitly requested otherwise.
- **Config persistence**: use `ctx.saveConfig(...)` for changes that must persist to disk; use `ctx.setConfig(...)` only for in-memory/session updates.

## Execution Rules
- If a command fails due to insufficient permissions, rerun with elevated approval.
- For `pnpm` commands that hit network issues, retry first.
- After completing a task, run `pnpm lint` and `pnpm test` and ensure they pass before handing work back.

## Serena MCP & Context7 Tools
When starting work or if you hit issues, try checking MCP for Serena or Context7 tooling. If available, use those tools to navigate, edit, or fetch docs efficiently.
