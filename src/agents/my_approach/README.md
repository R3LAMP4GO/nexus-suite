# my_approach — Org-Scoped Brand Strategy

Per-organization brand voice, content strategy, and platform mix configuration.

## Structure

Each org gets a directory at runtime (created by the Brand Persona Agent or admin):

```
my_approach/
  {org_id}/
    brand-voice.md       # Generated brand system prompt
    content-strategy.json # Platform mix, posting frequency, content pillars
    competitors.json      # Tracked competitor profiles + outlier thresholds
    tone-examples.md      # Example posts demonstrating correct tone
```

## How It's Used

1. **Brand Persona Agent** generates `brand-voice.md` from onboarding data
2. `buildSystemPrompt()` in `src/agents/general/prompts.ts` injects brand voice into every agent call
3. Workflow executor reads `content-strategy.json` for scheduling decisions
4. Client plugins in `src/agents/clients/{org_id}/` can reference these files

## File Formats

### brand-voice.md
Free-form markdown. Injected as `## Brand Voice` section in agent system prompts.

### content-strategy.json
```json
{
  "platforms": ["TIKTOK", "INSTAGRAM", "YOUTUBE"],
  "postingFrequency": { "TIKTOK": "2x/day", "INSTAGRAM": "1x/day", "YOUTUBE": "3x/week" },
  "contentPillars": ["AI productivity", "tech reviews", "day-in-the-life"],
  "toneKeywords": ["authoritative", "approachable", "data-driven"],
  "avoidTopics": ["politics", "religion"],
  "hashtagStrategy": "niche-first"
}
```
