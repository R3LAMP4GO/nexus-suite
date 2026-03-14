---
name: commit
description: Run checks, commit with AI message, and push
---

1. Run quality checks — fix ALL errors before continuing:
   - `npx tsc --noEmit` (typecheck)
   - `npx eslint . --max-warnings 0` (lint)
   - `npx vitest run` (tests)

2. Run `git status` and `git diff --staged` and `git diff` to review changes.

3. Stage relevant files with `git add` (specific files, not -A).

4. Generate a commit message: start with a verb (Add/Update/Fix/Remove/Refactor), be specific and concise.

5. Commit and push: `git commit -m "message"` then `git push`.
