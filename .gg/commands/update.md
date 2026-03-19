---
name: update
description: Update dependencies, fix deprecations and warnings
---

## Step 0: Detect Package Manager

Before running any commands, detect which package manager this project uses:

```bash
ls bun.lock bun.lockb pnpm-lock.yaml yarn.lock package-lock.json 2>/dev/null
```

- `bun.lock` or `bun.lockb` → use `bun` (install: `bun install`, add: `bun add`, run: `bun run`, exec: `bunx`)
- `pnpm-lock.yaml` → use `pnpm` (install: `pnpm install`, add: `pnpm add`, run: `pnpm run`, exec: `pnpm exec`)
- `yarn.lock` → use `yarn` (install: `yarn install`, add: `yarn add`, run: `yarn run`, exec: `yarn`)
- `package-lock.json` → use `npm` (install: `npm install`, add: `npm install`, run: `npm run`, exec: `npx`)

Use the detected package manager for ALL commands below. The examples use `$PM` as a placeholder — substitute the real command.

## Step 1: Check for Updates

Run `$PM outdated` (note: bun doesn't have `outdated` — use `npm outdated` as a read-only check, or `bunx npm-check-updates` instead). Review the output to understand which packages have new versions available (wanted vs latest).

## Step 2: Update Dependencies

Run `$PM update` to update all packages within their semver ranges.

Then check for security vulnerabilities (bun: `bun audit` or `npm audit` as fallback). If vulnerabilities are found, fix compatible ones.

For major version upgrades shown in Step 1, evaluate each one individually — check changelogs for breaking changes before updating with `$PM add <package>@latest`.

## Step 3: Check for Deprecations & Warnings

Run `$PM install 2>&1` and read ALL output carefully. Look for:
- Deprecation warnings
- Security vulnerabilities
- Peer dependency warnings
- Engine compatibility warnings
- Breaking changes

Also run `$EXEC next build --webpack 2>&1 | head -100` and check for Next.js-specific deprecation warnings.

## Step 4: Fix Issues

For each warning/deprecation found:
1. Research the recommended replacement or fix (use `web_search` or `web_fetch` for changelogs/migration guides)
2. Update code and/or dependencies accordingly
3. Re-run `$PM install` to verify the warning is resolved
4. Repeat until no warnings remain

Common fixes:
- Replace deprecated packages with their recommended successors
- Update import paths that have changed
- Fix peer dependency conflicts by aligning versions
- Address Node.js engine requirements

## Step 5: Run Quality Checks

Run these commands and fix ALL errors before completing:

```bash
$EXEC eslint .
$EXEC tsc --noEmit
$PM run build
$PM test
```

Fix all lint errors, type errors, build failures, and test failures introduced by the updates.

## Step 6: Verify Clean Install

Delete dependency caches and do a fresh install to verify zero warnings:

```bash
rm -rf node_modules
# Also remove the lockfile for the detected PM (e.g. bun.lock, package-lock.json, etc.)
$PM install
```

Confirm the install completes with ZERO warnings, deprecations, or vulnerability notices. If any remain, go back to Step 4 and fix them.
