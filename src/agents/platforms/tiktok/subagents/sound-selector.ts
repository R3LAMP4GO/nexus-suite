// TikTok sub-agent: Sound Selector — Tier 2.5
// Selects trending sounds and music for maximum TikTok reach.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";

const searchTrendingSounds = createTool({
  id: "searchTrendingSounds",
  description: "Search trending TikTok audio by niche or mood",
  inputSchema: z.object({
    niche: z.string().describe("Content niche to find sounds for (e.g. fitness, comedy, education)"),
    mood: z.string().optional().describe("Desired mood (e.g. upbeat, chill, dramatic)"),
  }),
  execute: async (input) => {
    const { niche, mood } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { niche: string; mood?: string }) => {
        const mood = input.mood ?? "any";

        // Curated trending sound categories by niche and mood
        const SOUND_DB: Record<string, Record<string, Array<{ name: string; type: string; bpm: number; viralScore: number; tip: string }>>> = {
          fitness: {
            upbeat: [
              { name: "High-energy EDM remix (trending)", type: "music", bpm: 140, viralScore: 9, tip: "Best for transformation montages" },
              { name: "Motivational speech overlay", type: "voiceover", bpm: 0, viralScore: 8, tip: "Layer under workout footage" },
              { name: "Bass-heavy gym anthem", type: "music", bpm: 128, viralScore: 7, tip: "Use for PR/heavy lift clips" },
            ],
            chill: [
              { name: "Lo-fi beats (study girl remix)", type: "music", bpm: 85, viralScore: 6, tip: "Good for meal prep content" },
              { name: "Acoustic morning routine", type: "music", bpm: 90, viralScore: 5, tip: "Pairs with GRWM fitness content" },
            ],
            dramatic: [
              { name: "Cinematic orchestra build", type: "music", bpm: 100, viralScore: 8, tip: "Perfect for body transformation reveals" },
              { name: "Slow-mo bass drop", type: "music", bpm: 70, viralScore: 7, tip: "Sync the drop with the transformation moment" },
            ],
          },
          comedy: {
            upbeat: [
              { name: "Funny sound effect compilation", type: "sfx", bpm: 0, viralScore: 9, tip: "Time punchlines to sound cues" },
              { name: "Sitcom laugh track (ironic)", type: "sfx", bpm: 0, viralScore: 7, tip: "Use sparingly — works for deadpan humor" },
            ],
            dramatic: [
              { name: "Dramatic chipmunk sting", type: "sfx", bpm: 0, viralScore: 8, tip: "Classic reaction sound — always reliable" },
              { name: "Horror violin screech", type: "sfx", bpm: 0, viralScore: 7, tip: "For unexpected twist reveals" },
            ],
          },
          education: {
            chill: [
              { name: "Soft piano background", type: "music", bpm: 72, viralScore: 6, tip: "Non-distracting for talking-head content" },
              { name: "Ambient focus beats", type: "music", bpm: 80, viralScore: 5, tip: "Good for screen recordings and tutorials" },
            ],
            upbeat: [
              { name: "Upbeat indie pop", type: "music", bpm: 110, viralScore: 7, tip: "Keeps energy up for list-style content" },
              { name: "Tech/futuristic synth", type: "music", bpm: 120, viralScore: 6, tip: "Works for AI/tech education content" },
            ],
          },
        };

        const nicheKey = input.niche.toLowerCase();
        const nicheSounds = SOUND_DB[nicheKey] ?? SOUND_DB.education;
        const moodSounds = mood !== "any" && nicheSounds[mood]
          ? nicheSounds[mood]
          : Object.values(nicheSounds).flat();

        return {
          niche: input.niche,
          mood,
          sounds: moodSounds,
          strategy: {
            trendingVsOriginal: "Use trending sounds for 60% of posts (algorithmic boost), original audio for 40% (brand building)",
            timing: "Trending sounds have a 7-14 day viral window — use them quickly after they peak",
            sync: "Key visual moments should align with audio beats/drops for maximum retention",
          },
          tips: [
            "Save trending sounds to your library immediately — they may get removed",
            "Original audio with your voice can become trending if it's catchy/quotable",
            "Low-volume background music + captions outperforms loud music for educational content",
            "Check the 'Trending' tab in TikTok's sound library before every post",
          ],
        };
      },
      { agentName: "sound-selector", toolName: "searchTrendingSounds" },
    );
    return wrappedFn({ niche, mood });
  },
});

export const soundSelectorAgent = new Agent({
  id: "sound-selector",
  name: "sound-selector",
  instructions: `You are a Sound Selector sub-agent for the TikTok platform.

Your job is to select optimal sounds and music:
- Identify trending sounds in the brand's niche
- Match sound mood to content type (educational, entertaining, emotional)
- Consider sound timing for key moments in the video
- Suggest original audio vs trending sound strategy
- Flag sounds with licensing concerns

Trending sounds boost algorithmic reach. Original audio builds brand identity.
Recommend the right balance based on content goals.`,
  model: modelConfig.tier25,
  tools: { searchTrendingSounds },
});
