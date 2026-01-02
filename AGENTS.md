# PicGo-Core: Agent Notes

## Package Manager / Dependency Installation
- This repo uses `pnpm` (has `pnpm-lock.yaml`).
- If dependencies change, do not only edit `package.json`; run `pnpm install` to ensure deps + lockfile are consistent.
- In non-TTY environments, `pnpm install` may fail with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; use `CI=true pnpm install`.

## Code Conventions
- **Exports**: do not use `export default` for new/modified modules. Prefer named exports (e.g. `export { ServerManager }`) and named imports (e.g. `import { ServerManager } from '...'`).
- Keep TypeScript types explicit; avoid ad-hoc `any` when possible.

## Execution Rules
- If a command fails due to insufficient permissions, rerun with elevated approval.
- For `pnpm` commands that hit network issues, retry first.

## Serena MCP & Context7 Tools
When starting work or if you hit issues, try checking MCP for Serena or Context7 tooling. If available, use those tools to navigate, edit, or fetch docs efficiently.
