---
name: fix
description: Run typechecking and linting, then spawn parallel agents to fix all issues
---

Run all linting and typechecking tools, collect errors, group them by domain, and use the subagent tool to spawn parallel sub-agents to fix them.

## Step 1: Run Checks

Run these commands and capture their full output (allow non-zero exit codes):

```bash
npx tsc --noEmit 2>&1 | head -200
```

```bash
npx eslint . 2>&1 | head -200
```

## Step 2: Collect and Group Errors

Parse the output from both commands. Group errors into domains:

- **Type errors**: Issues from `tsc --noEmit` (e.g. TS2345, TS2322, TS7006, etc.)
- **Lint errors**: Issues from `eslint` (e.g. no-unused-vars, prefer-const, react-hooks/*, @typescript-eslint/*, import/*, etc.)

If either command produced zero errors, skip that domain entirely.

## Step 3: Spawn Parallel Agents

For each domain that has errors, use the `subagent` tool to spawn a sub-agent with a task containing:
- The full list of errors for that domain (file paths, line numbers, error messages)
- Clear instructions to fix every error
- Instruction to NOT introduce new errors or change behavior

Spawn all domain agents in parallel (one subagent call per domain).

If there are many errors in a single domain (>15 files), split into multiple sub-agents by file grouping to keep each agent's scope manageable.

## Step 4: Verify

After all agents complete, re-run both checks:

```bash
npx tsc --noEmit 2>&1
npx eslint . 2>&1
```

If errors remain, repeat Steps 2-3 for the remaining issues (max 2 retries).

Report the final status: how many errors were fixed and whether any remain.
