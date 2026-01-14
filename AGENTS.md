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
- Keep TypeScript types explicit; avoid ad-hoc `any` when possible.
- Don't write `as any` in TypeScript code unless absolutely necessary. Always prefer explicit types.
- **i18n / user-facing text**: do not hard-code user-facing strings (logs, errors, CLI descriptions/prompts, HTML result pages). Add i18n keys under `src/i18n/zh-CN.ts` and provide corresponding entries in `src/i18n/en.ts` and `src/i18n/zh-TW.ts`, then use `ctx.i18n.translate<ILocalesKey>(...)` (supports `${var}` placeholders via args).
- **Commander actions**: prefer `.action(async (...) => { ... })` and avoid wrapping an IIFE like `.action(() => { (async () => { ... })().catch(...) })`.
- **Commander prompts**: avoid `prompt<any>` / `prompt<IStringKeyMap<any>>`; declare a concrete answer type (e.g. `prompt<{ operation: 'list' | 'rename' }>(...)`).
- **Config persistence**: use `ctx.saveConfig(...)` for changes that must persist to disk; use `ctx.setConfig(...)` only for in-memory/session updates.

## Execution Rules
- If a command fails due to insufficient permissions, rerun with elevated approval.
- For `pnpm` commands that hit network issues, retry first.

## Serena MCP & Context7 Tools
When starting work or if you hit issues, try checking MCP for Serena or Context7 tooling. If available, use those tools to navigate, edit, or fetch docs efficiently.
