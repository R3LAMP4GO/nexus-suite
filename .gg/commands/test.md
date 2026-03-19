---
description: Run the project test suite
---

# Test Runner

## Unit Tests (Vitest)
```bash
# Run all unit tests
bunx vitest run

# Run specific test file
bunx vitest run src/lib/rate-limit.test.ts

# Run tests matching a pattern
bunx vitest run --reporter=verbose src/server/services/

# Run with coverage
bunx vitest run --coverage

# Watch mode (for development)
bunx vitest
```

## E2E Tests (Playwright)
```bash
# Run all e2e tests
bunx playwright test

# Run specific e2e spec
bunx playwright test e2e/dashboard.spec.ts

# Run with UI mode
bunx playwright test --ui

# Run headed (visible browser)
bunx playwright test --headed
```

## Full Quality Check
```bash
bunx eslint .
bunx tsc --noEmit
bunx vitest run
bunx playwright test
```
