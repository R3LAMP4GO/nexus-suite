Run the test suite with the specified variant.

Usage: /test [variant]

Variants:
- (no args) — full suite: `npm test`
- watch — interactive watch mode: `npm run test:watch`
- coverage — coverage report: `npm run test:coverage`
- src — only src tests: `npx vitest run src/`
- services — only service tests: `npx vitest run services/`
- pattern <name> — by pattern: `npx vitest run -t "<name>"`
- file <path> — single file: `npx vitest run <path>`

Run the appropriate command based on the variant argument: $ARGUMENTS
