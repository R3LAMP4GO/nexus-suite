import { registerAgent } from "../server/workflows/agent-delegate";
import { generateOrchestrator } from "./orchestrator/agent";
import { generateWorkflow } from "./orchestrator/workflow-agent";
// Platform agents
import { generateYoutube } from "./platforms/youtube/agent";
import { generateTiktok } from "./platforms/tiktok/agent";
import { generateInstagram } from "./platforms/instagram/agent";
import { generateLinkedin } from "./platforms/linkedin/agent";
import { generateX } from "./platforms/x/agent";
import { generateFacebook } from "./platforms/facebook/agent";
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
import { generate as generateTrendScout } from "./specialists/trend-scout";
import { generate as generateEngagementResponder } from "./specialists/engagement-responder";
import { generate as generateAnalyticsReporter } from "./specialists/analytics-reporter";
import { generate as generateContentRepurposer } from "./specialists/content-repurposer";
import { generate as generateQualityScorer } from "./specialists/quality-scorer";
import { generate as generateVariationOrchestrator } from "./specialists/variation-orchestrator";
import { generate as generateBrandPersona } from "./specialists/brand-persona-agent";
import { generate as generateViralTeardown } from "./specialists/viral-teardown-agent";

/**
 * Bootstrap all 25 agents into the global registry.
 * Called at application startup.
 */
export function bootstrapAgents(): void {
  // Tier 1: Orchestration (2)
  registerAgent("nexus-orchestrator", (prompt, opts) =>
    generateOrchestrator(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("workflow-agent", (prompt, opts) =>
    generateWorkflow(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );

  // Tier 2: Platform agents (6)
  registerAgent("youtube-agent", (prompt, opts) =>
    generateYoutube(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("tiktok-agent", (prompt, opts) =>
    generateTiktok(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("instagram-agent", (prompt, opts) =>
    generateInstagram(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("linkedin-agent", (prompt, opts) =>
    generateLinkedin(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("x-agent", (prompt, opts) =>
    generateX(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("facebook-agent", (prompt, opts) =>
    generateFacebook(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );

  // Tier 3: Specialist agents (17)
  registerAgent("seo-agent", (prompt, opts) =>
    generateSeo(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("hook-writer", (prompt, opts) =>
    generateHookWriter(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("title-generator", (prompt, opts) =>
    generateTitleGenerator(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("thumbnail-creator", (prompt, opts) =>
    generateThumbnailCreator(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("script-agent", (prompt, opts) =>
    generateScriptAgent(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("caption-writer", (prompt, opts) =>
    generateCaptionWriter(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("hashtag-optimizer", (prompt, opts) =>
    generateHashtagOptimizer(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("thread-writer", (prompt, opts) =>
    generateThreadWriter(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("article-writer", (prompt, opts) =>
    generateArticleWriter(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("trend-scout", (prompt, opts) =>
    generateTrendScout(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("engagement-responder", (prompt, opts) =>
    generateEngagementResponder(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("analytics-reporter", (prompt, opts) =>
    generateAnalyticsReporter(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("content-repurposer", (prompt, opts) =>
    generateContentRepurposer(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("quality-scorer", (prompt, opts) =>
    generateQualityScorer(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("variation-orchestrator", (prompt, opts) =>
    generateVariationOrchestrator(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("brand-persona-agent", (prompt, opts) =>
    generateBrandPersona(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
  registerAgent("viral-teardown-agent", (prompt, opts) =>
    generateViralTeardown(prompt, { organizationId: "", userPrompt: prompt }, opts),
  );
}
