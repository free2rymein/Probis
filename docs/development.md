# Development

## Local Apps

- Web: `pnpm dev:web`
- API: `pnpm dev:api`
- Full workspace: `pnpm dev`

## Quality Gates

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

Keep shared packages small and stable. Move code into a package only when at least two apps or services need the contract.
