import { registerAgent } from "../server/workflows/agent-delegate";
import { orchestratorAgent } from "./orchestrator/agent";
import { generateWorkflow } from "./orchestrator/workflow-agent";
// Platform agents — export Agent instances, not generate functions
import { youtubeMainAgent } from "./platforms/youtube/agent";
import { tiktokMainAgent } from "./platforms/tiktok/agent";
import { instagramMainAgent } from "./platforms/instagram/agent";
import { linkedinMainAgent } from "./platforms/linkedin/agent";
import { xMainAgent } from "./platforms/x/agent";
import { generateFacebook } from "./platforms/facebook/agent";
// Tier 2.5: Platform sub-agents
import { communityPostFormatterAgent } from "./platforms/youtube/subagents/community-post-formatter";
import { shortsOptimizerAgent } from "./platforms/youtube/subagents/shorts-optimizer";
import { duetStitchLogicAgent } from "./platforms/tiktok/subagents/duet-stitch-logic";
import { soundSelectorAgent } from "./platforms/tiktok/subagents/sound-selector";
import { carouselSequencerAgent } from "./platforms/instagram/subagents/carousel-sequencer";
import { storyFormatterAgent } from "./platforms/instagram/subagents/story-formatter";
import { professionalToneAdapterAgent } from "./platforms/linkedin/subagents/professional-tone-adapter";
import { articleFormatterAgent } from "./platforms/linkedin/subagents/article-formatter";
import { newsScoutAgent } from "./platforms/x/subagents/news-scout";
import { toneTranslatorAgent } from "./platforms/x/subagents/tone-translator";
import { engagementResponderAgent } from "./platforms/x/subagents/engagement-responder";
// Specialist agents
import { generate as generateSeo } from "./specialists/seo-agent";
import { generate as generateHookWriter } from "./specialists/hook-writer";
import { generate as generateTitleGenerator } from "./specialists/title-generator";
import { generate as generateThumbnailCreator } from "./specialists/thumbnail-creator";
import { generate as generateScriptAgent } from "./specialists/script-agent";
import { generate as generateCaptionWriter } from "./specialists/caption-writer";
import { generate as generateHashtagOptimizer } from "./specialists/hashtag-optimizer";
import { generate as generateThreadWriter } from "./specialists/thread-writer";
import { generate as generateArticleWriter } from "./specialists/article-writer";
import { trendScoutAgent } from "./specialists/trend-scout";
import { generate as generateEngagementResponder } from "./specialists/engagement-responder";
import { generate as generateAnalyticsReporter } from "./specialists/analytics-reporter";
import { generate as generateContentRepurposer } from "./specialists/content-repurposer";
import { generate as generateQualityScorer } from "./specialists/quality-scorer";
import { generate as generateVariationOrchestrator } from "./specialists/variation-orchestrator";
import { generate as generateBrandPersona } from "./specialists/brand-persona-agent";
import { generate as generateViralTeardown } from "./specialists/viral-teardown-agent";
import { generate as generateDistributionStrategist } from "./specialists/distribution-strategist";
import { generate as generateReplyJacker } from "./specialists/reply-jacker";
import { generate as generateTranscriptExtractor } from "./specialists/transcript-extractor";
import { generate as generateAutoClipper } from "./specialists/auto-clipper";
import { generate as generateContentRecreator } from "./specialists/content-recreator";
import { generate as generateEditDirector } from "./specialists/edit-director";
import { generate as generateCaptionGenerator } from "./specialists/caption-generator";

/**
 * Bootstrap all agents into the global registry.
 * Called at application startup.
 */
export function bootstrapAgents(): void {
  // Tier 1: Orchestration (2)
  // Register under both names: "nexus-orchestrator" (canonical) and "orchestrator" (agent name)
  // The Agent object uses name "orchestrator", and delegateToSpecialist resolves by registry key.
  const orchestratorFn = async (prompt: string) => {
    const result = await orchestratorAgent.generate(prompt, {});
    return { text: result.text, usage: result.usage ? { promptTokens: result.usage.inputTokens ?? 0, completionTokens: result.usage.outputTokens ?? 0, model: "default" } : undefined };
  };
  registerAgent("nexus-orchestrator", orchestratorFn);
  registerAgent("orchestrator", orchestratorFn);
  registerAgent("workflow-agent", (prompt, opts) =>
    generateWorkflow(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );

  // Tier 2: Platform agents (6) — wrap Agent.generate for those without a generate fn
  registerAgent("youtube-main", async (prompt, opts) => {
    const result = await youtubeMainAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("tiktok-main", async (prompt, opts) => {
    const result = await tiktokMainAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("instagram-main", async (prompt, opts) => {
    const result = await instagramMainAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("linkedin-main", async (prompt, opts) => {
    const result = await linkedinMainAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("x-main", async (prompt, opts) => {
    const result = await xMainAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("facebook-agent", (prompt, opts) =>
    generateFacebook(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );

  // Tier 2.5: Platform sub-agents (11)
  registerAgent("community-post-formatter", async (prompt, opts) => {
    const result = await communityPostFormatterAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("shorts-optimizer", async (prompt, opts) => {
    const result = await shortsOptimizerAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("duet-stitch-logic", async (prompt, opts) => {
    const result = await duetStitchLogicAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("sound-selector", async (prompt, opts) => {
    const result = await soundSelectorAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("carousel-sequencer", async (prompt, opts) => {
    const result = await carouselSequencerAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("story-formatter", async (prompt, opts) => {
    const result = await storyFormatterAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("professional-tone-adapter", async (prompt, opts) => {
    const result = await professionalToneAdapterAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("article-formatter", async (prompt, opts) => {
    const result = await articleFormatterAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("news-scout", async (prompt, opts) => {
    const result = await newsScoutAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("tone-translator", async (prompt, opts) => {
    const result = await toneTranslatorAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("x-engagement-responder", async (prompt, opts) => {
    const result = await engagementResponderAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });

  // Tier 3: Specialist agents (17)
  // Brand voice and organizationId are injected from the workflow context via opts
  const buildCtx = (prompt: string, opts?: { brandVoice?: string }) => ({
    organizationId: "", // Populated by workflow context at runtime
    userPrompt: prompt,
    brandVoice: opts?.brandVoice,
  });

  registerAgent("seo-agent", (prompt, opts) =>
    generateSeo(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("hook-writer", (prompt, opts) =>
    generateHookWriter(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("title-generator", (prompt, opts) =>
    generateTitleGenerator(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("thumbnail-creator", (prompt, opts) =>
    generateThumbnailCreator(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("script-agent", (prompt, opts) =>
    generateScriptAgent(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("caption-writer", (prompt, opts) =>
    generateCaptionWriter(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("hashtag-optimizer", (prompt, opts) =>
    generateHashtagOptimizer(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("thread-writer", (prompt, opts) =>
    generateThreadWriter(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("article-writer", (prompt, opts) =>
    generateArticleWriter(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("trend-scout", async (prompt, opts) => {
    const result = await trendScoutAgent.generate(prompt, { modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined });
    return { text: result.text };
  });
  registerAgent("engagement-responder", (prompt, opts) =>
    generateEngagementResponder(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("analytics-reporter", (prompt, opts) =>
    generateAnalyticsReporter(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("content-repurposer", (prompt, opts) =>
    generateContentRepurposer(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("quality-scorer", (prompt, opts) =>
    generateQualityScorer(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("variation-orchestrator", (prompt, opts) =>
    generateVariationOrchestrator(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("brand-persona-agent", (prompt, opts) =>
    generateBrandPersona(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("viral-teardown-agent", (prompt, opts) =>
    generateViralTeardown(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("distribution-strategist", (prompt, opts) =>
    generateDistributionStrategist(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("reply-jacker", (prompt, opts) =>
    generateReplyJacker(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("transcript-extractor", (prompt, opts) =>
    generateTranscriptExtractor(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("auto-clipper", (prompt, opts) =>
    generateAutoClipper(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("content-recreator", (prompt, opts) =>
    generateContentRecreator(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("edit-director", (prompt, opts) =>
    generateEditDirector(prompt, buildCtx(prompt, opts), opts),
  );
  registerAgent("caption-generator", (prompt, opts) =>
    generateCaptionGenerator(prompt, buildCtx(prompt, opts), opts),
  );
}
