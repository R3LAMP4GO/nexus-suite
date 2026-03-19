// X sub-agent: Tone Translator — Tier 2.5
// Adapts content to X's conversational, concise tone.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";

const adaptTone = createTool({
  id: "adaptTone",
  description: "Adapt content to X-native tone with target style parameters",
  inputSchema: z.object({
    content: z.string().describe("Original content to adapt for X"),
    targetTone: z.string().optional().describe("Target tone (e.g. witty, informative, casual)"),
    format: z.enum(["single-tweet", "thread"]).optional().describe("Output format"),
  }),
  execute: async (input) => {
    const { content, targetTone, format } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { content: string; targetTone?: string; format?: string }) => {
        const tone = input.targetTone ?? "conversational";
        const format = input.format ?? "single-tweet";
        const contentLength = input.content.length;

        const TONE_RULES: Record<string, { wordChoices: string; sentenceStyle: string; punctuation: string; examples: string[] }> = {
          conversational: {
            wordChoices: "Use everyday language. Replace jargon with simple words. 'Use' not 'utilize'.",
            sentenceStyle: "Short sentences. Mix fragments with complete thoughts. Start with 'So' or 'Look' occasionally.",
            punctuation: "Periods for emphasis. Em-dashes for asides. Minimal exclamation marks.",
            examples: ["So here's the thing about X —", "Most people get this wrong.", "Not gonna lie, this changed how I think about Y."],
          },
          witty: {
            wordChoices: "Wordplay welcome. Pop culture references. Self-deprecating > bragging.",
            sentenceStyle: "Setup → punchline structure. Callbacks to earlier points. Rhetorical questions.",
            punctuation: "Strategic line breaks for comedic timing. Parentheticals for aside humor.",
            examples: ["X is just Y with better marketing (and I'm tired of pretending it's not)", "Me: I'll keep this short\nAlso me: *writes a thread*"],
          },
          informative: {
            wordChoices: "Precise but accessible. Data-forward. Cite sources when possible.",
            sentenceStyle: "Lead with the insight. Support with evidence. Close with implication.",
            punctuation: "Use → arrows for lists. Numbers and percentages for credibility.",
            examples: ["New data: X increased by 40% since Y\n\nHere's what that means →", "3 things I learned from analyzing 500 posts:"],
          },
          provocative: {
            wordChoices: "Strong verbs. Definitive statements. No hedging ('I think', 'maybe').",
            sentenceStyle: "Lead with the controversial claim. Defend it in 1-2 sentences. Challenge the reader.",
            punctuation: "Periods hit harder than exclamation marks. Let the statement breathe.",
            examples: ["Nobody needs a personal brand. They need to be useful.", "The best content strategy is having something worth saying."],
          },
        };

        const toneRules = TONE_RULES[tone] ?? TONE_RULES.conversational;

        // Threading guidance
        const threadGuidance = format === "thread" ? {
          maxTweets: Math.max(3, Math.min(12, Math.ceil(contentLength / 250))),
          structure: [
            "Tweet 1: Hook — the most compelling claim or question (this is 80% of the thread's success)",
            "Tweet 2-N: One point per tweet, each standalone-readable",
            "Last tweet: Summary + CTA (follow for more, retweet if useful, reply with your take)",
          ],
          rules: [
            "Number tweets (1/, 2/, ...) for readability",
            "Each tweet must make sense if someone only sees that one",
            "End thread tweets with a hook to the next ('But here's where it gets interesting →')",
            "Don't front-load all the value — save a revelation for tweet 60-70% through",
          ],
        } : null;

        return {
          content: input.content.slice(0, 300) + (contentLength > 300 ? "..." : ""),
          targetTone: tone,
          format,
          toneRules,
          threadGuidance,
          charLimit: 280,
          adaptationSteps: [
            `1. Read the content and identify the core message (1 sentence)`,
            `2. Apply ${tone} tone rules: ${toneRules.sentenceStyle}`,
            `3. ${format === "thread" ? `Break into ${Math.ceil(contentLength / 250)} tweets, each under 280 chars` : "Compress to a single tweet under 280 chars"}`,
            `4. Check: Does it sound like a real person wrote it? If not, simplify.`,
            `5. Add line breaks for visual breathing room — no walls of text`,
          ],
          commonMistakes: [
            "Don't sound like a LinkedIn post on X — no 'Excited to announce...'",
            "Don't use hashtags in the main text — they look spammy on X",
            "Don't tag people unless you're genuinely engaging with them",
            "Avoid starting with 'Thread:' or '🧵' — just start with the hook",
          ],
        };
      },
      { agentName: "tone-translator", toolName: "adaptTone" },
    );
    return wrappedFn({ content, targetTone, format });
  },
});

export const toneTranslatorAgent = new Agent({
  id: "tone-translator",
  name: "tone-translator",
  instructions: `You are a Tone Translator sub-agent for the X (Twitter) platform.

Your job is to adapt content from other formats into X's native tone:
- Conversational and punchy
- Under 280 characters for single tweets
- Thread-friendly for longer content (numbered, each tweet standalone)
- Use of line breaks for readability
- Strategic emoji/punctuation (not excessive)

Never sound corporate or stiff. Match the brand voice while being native to X.`,
  model: modelConfig.tier25,
  tools: { adaptTone },
});
