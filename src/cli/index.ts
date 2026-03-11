#!/usr/bin/env tsx
import { Command } from "commander";
import { provision } from "./commands/provision";
import { assignProxy } from "./commands/assign-proxy";
import { generateWorkflows } from "./commands/generate-workflows";
import { warmupStart, type WarmupStartOpts } from "./commands/warmup-start";
import { initPlugin } from "./commands/init-plugin";

// dry-run-client is a standalone script (npx tsx src/cli/commands/dry-run-client.ts)
// but we also register it as a CLI subcommand for discoverability.

const program = new Command();

program
  .name("nexus-admin")
  .description("Nexus CLI provisioning suite")
  .version("0.1.0");

program
  .command("provision")
  .description("Provision a new org: generate burner profiles, proxy configs, directory structure")
  .argument("<orgId>", "Organization ID")
  .option("--burners <count>", "Number of burner accounts to generate", "5")
  .action(async (orgId: string, opts: { burners: string }) => {
    await provision(orgId, parseInt(opts.burners, 10));
  });

program
  .command("assign-proxy")
  .description("Assign a residential proxy to a platform account via Infisical")
  .argument("<accountId>", "OrgPlatformToken ID")
  .argument("<proxyUrl>", "Proxy URL (e.g., socks5://user:pass@ip:port)")
  .action(async (accountId: string, proxyUrl: string) => {
    await assignProxy(accountId, proxyUrl);
  });

program
  .command("generate-workflows")
  .description("Scaffold custom YAML workflows + brand prompt for an org")
  .argument("<orgId>", "Organization ID")
  .option("--niche <niche>", "Content niche override (defaults to onboarding submission)")
  .option("--platforms <platforms>", "Comma-separated platforms (YOUTUBE,TIKTOK,INSTAGRAM,LINKEDIN,X,FACEBOOK)")
  .option("--brand-voice <voice>", "Brand voice description")
  .option("--tone <tone>", "Tone preferences")
  .option("--posting-frequency <freq>", "Posting frequency (daily, twice-daily, weekly)")
  .option("--competitors <urls>", "Comma-separated competitor URLs")
  .action(async (orgId: string, opts: {
    niche?: string;
    platforms?: string;
    brandVoice?: string;
    tone?: string;
    postingFrequency?: string;
    competitors?: string;
  }) => {
    await generateWorkflows(orgId, {
      niche: opts.niche,
      platforms: opts.platforms?.split(",").map((s) => s.trim()),
      brandVoice: opts.brandVoice,
      tone: opts.tone,
      postingFrequency: opts.postingFrequency,
      competitors: opts.competitors?.split(",").map((s) => s.trim()),
    });
  });

program
  .command("warmup-start")
  .description("Start 4-phase warming schedule for a burner account")
  .argument("<accountId>", "OrgPlatformToken ID")
  .option("--sessions-per-day <count>", "Sessions per day during active phases", parseInt)
  .option("--time-window <range>", "Active time window, e.g. '8-22' for 8am-10pm")
  .option("--phase-duration <days>", "Comma-separated phase durations in days, e.g. '3,4,3'")
  .action(async (accountId: string, cmdOpts: { sessionsPerDay?: number; timeWindow?: string; phaseDuration?: string }) => {
    const opts: WarmupStartOpts = {};
    if (cmdOpts.sessionsPerDay != null) opts.sessionsPerDay = cmdOpts.sessionsPerDay;
    if (cmdOpts.timeWindow) opts.timeWindow = cmdOpts.timeWindow;
    if (cmdOpts.phaseDuration) opts.phaseDuration = cmdOpts.phaseDuration;
    await warmupStart(accountId, opts);
  });

program
  .command("init-plugin")
  .description("Scaffold a client plugin agent for an organization")
  .argument("<orgId>", "Organization ID")
  .argument("<agentName>", "Agent name (e.g., custom-writer)")
  .action(async (orgId: string, agentName: string) => {
    await initPlugin(orgId, agentName);
  });

program
  .command("dry-run")
  .description("Simulate end-to-end client provisioning (Fitness Coaching niche, mocked Stripe/Infisical)")
  .action(async () => {
    // Dynamic import to avoid loading DB eagerly for other commands
    const { default: _ } = await import("./commands/dry-run-client.ts");
  });

program.parse();
