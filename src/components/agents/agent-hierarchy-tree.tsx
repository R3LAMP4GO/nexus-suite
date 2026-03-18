"use client";

export interface AgentEntry {
  name: string;
  tier: 1 | 2 | 3;
  toolCount: number;
  stats?: {
    totalRuns: number;
    successRate: number;
    avgDuration: number;
    tokenUsage: number;
    lastRunAt: Date | null;
  };
}

export interface AgentHierarchyTreeProps {
  agents: AgentEntry[];
}

export function AgentHierarchyTree({ agents }: AgentHierarchyTreeProps) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
      <p className="text-sm text-[var(--text-muted)]">AgentHierarchyTree — {agents.length} agents</p>
    </div>
  );
}
