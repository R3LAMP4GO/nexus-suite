# saraiknowsball — Client Plugin

NBA basketball commentary and culture content creator.

## Overview

| Field       | Value                                       |
|-------------|---------------------------------------------|
| Client ID   | `saraiknowsball`                            |
| Niche       | NBA Basketball / Sports Commentary           |
| Platforms   | YouTube, TikTok, Instagram, X               |
| Status      | Active                                       |

## Directory Structure

```
saraiknowsball/
  brand-prompt.md    ← Brand voice & tone guidelines (loaded by brand-loader.ts)
  config.json        ← Platform config, cadence, hashtags, audience targeting
  README.md          ← This file
  agents/            ← Custom agent overrides (empty — uses core specialists)
  tools/             ← Niche-specific tools (empty — none yet)
  workflows/         ← Custom workflow templates (empty — uses defaults)
```

## How It Works

1. **Brand Voice Injection**: `brand-loader.ts` reads `brand-prompt.md` by organization ID and injects it into agent context as `brandVoice`. Tier 3 specialist agents (hook-writer, caption-writer, script-agent, etc.) receive this to produce on-brand content.

2. **Context Minimization**: Per `prepare-context.ts`, client plugins operate under `CLIENT_PLUGIN_WHITELIST` — only `organizationId` and `input` are exposed. No raw config, credentials, or Infisical access.

3. **Agent Resolution**: The workflow engine checks `clients/saraiknowsball/agents/` first for any agent name. If no override exists, it falls back to platform subagents → core specialists.

4. **Config**: `config.json` provides structured metadata for scheduling, hashtag selection, and audience targeting. Consumed by the orchestrator and platform-main agents.

## Content Strategy

- **Daily**: TikTok shorts (2x), Instagram reels, X posts (3x), IG stories
- **2x/week**: YouTube long-form (Tue/Fri), X threads, IG carousels (3x)
- **Game nights**: Pre-game, halftime, and post-game reactive content
- **Timezone**: America/New_York (aligned with NBA broadcast schedule)

## Editing

- `brand-prompt.md` can be edited manually; changes take effect after cache clear or restart (`clearBrandPromptCache('saraiknowsball')`)
- `config.json` is read at workflow execution time — no restart required
- Custom agents can be added to `agents/` to override any core specialist
