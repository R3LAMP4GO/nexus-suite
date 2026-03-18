"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/trpc-client";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Modal, Button, Badge } from "@/components/ui/index";

const TIER_STYLES: Record<number, string> = {
  1: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  2: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  3: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

const TIER_LABELS: Record<number, string> = {
  1: "Tier 1 — Orchestrator",
  2: "Tier 2 — Platform",
  3: "Tier 3 — Specialist",
};

interface InvokeForm {
  prompt: string;
  model: string;
  maxTokens: string;
}

const EMPTY_FORM: InvokeForm = { prompt: "", model: "", maxTokens: "" };

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.84z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function AgentsPage() {
  const { data: agents, isLoading } = api.agents.list.useQuery();

  // Selection state
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

  // Single invoke modal
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [invokeForm, setInvokeForm] = useState<InvokeForm>(EMPTY_FORM);

  // Batch modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchPrompt, setBatchPrompt] = useState("");

  // Feedback
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Mutations
  const invokeMutation = api.agents.invoke.useMutation({
    onSuccess: () => {
      showToast(`Job queued for ${activeAgent}`);
      setActiveAgent(null);
      setInvokeForm(EMPTY_FORM);
    },
  });

  const batchMutation = api.agents.batchInvoke.useMutation({
    onSuccess: () => {
      showToast(`Batch job queued for ${selectedAgents.size} agents`);
      setBatchModalOpen(false);
      setBatchPrompt("");
      setSelectedAgents(new Set());
    },
  });

  // Handlers
  const toggleSelect = (name: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const openInvoke = (name: string) => {
    setActiveAgent(name);
    setInvokeForm(EMPTY_FORM);
  };

  const submitInvoke = () => {
    if (!activeAgent || !invokeForm.prompt.trim()) return;
    invokeMutation.mutate({
      agentName: activeAgent,
      prompt: invokeForm.prompt.trim(),
      ...(invokeForm.model ? { model: invokeForm.model } : {}),
      ...(invokeForm.maxTokens ? { maxTokens: Number(invokeForm.maxTokens) } : {}),
    });
  };

  const submitBatch = () => {
    if (selectedAgents.size < 2 || !batchPrompt.trim()) return;
    batchMutation.mutate({
      agents: Array.from(selectedAgents).map((name) => ({
        agentName: name,
        prompt: batchPrompt.trim(),
      })),
    });
  };

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Agents</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              All registered agents in the Mastra hierarchy
            </p>
          </div>
          {selectedAgents.size >= 2 && (
            <Button
              variant="primary"
              onClick={() => {
                setBatchPrompt("");
                setBatchModalOpen(true);
              }}
              icon={<PlayIcon className="h-4 w-4" />}
            >
              Deploy Selected ({selectedAgents.size})
            </Button>
          )}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : !agents?.length ? (
          <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] py-12 text-center text-[var(--text-muted)]">
            No agents registered.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => {
              const isSelected = selectedAgents.has(agent.name);
              return (
                <div
                  key={agent.name}
                  className={`relative rounded-lg border bg-[var(--card-bg)] p-4 shadow-sm transition-colors ${
                    isSelected
                      ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--card-border)]"
                  }`}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(agent.name)}
                    className="absolute left-3 top-3 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)] cursor-pointer"
                    aria-label={`Select ${agent.name}`}
                  />

                  <div className="ml-6 flex items-center justify-between">
                    <span className="truncate font-medium text-[var(--text-primary)]">
                      {agent.name}
                    </span>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        TIER_STYLES[agent.tier] ?? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {TIER_LABELS[agent.tier] ?? `Tier ${agent.tier}`}
                    </span>
                  </div>

                  {/* Run button */}
                  <div className="mt-3 ml-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<PlayIcon className="h-3.5 w-3.5" />}
                      onClick={() => openInvoke(agent.name)}
                    >
                      Run
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Single Invoke Modal */}
      <Modal
        open={activeAgent !== null}
        onClose={() => {
          setActiveAgent(null);
          setInvokeForm(EMPTY_FORM);
        }}
        title={`Invoke ${activeAgent ?? "Agent"}`}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              Prompt <span className="text-[var(--danger)]">*</span>
            </label>
            <textarea
              rows={3}
              value={invokeForm.prompt}
              onChange={(e) => setInvokeForm((f) => ({ ...f, prompt: e.target.value }))}
              placeholder="Enter a prompt for this agent..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                Model
              </label>
              <input
                type="text"
                value={invokeForm.model}
                onChange={(e) => setInvokeForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="e.g. gpt-4o"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                Max Tokens
              </label>
              <input
                type="number"
                value={invokeForm.maxTokens}
                onChange={(e) => setInvokeForm((f) => ({ ...f, maxTokens: e.target.value }))}
                placeholder="e.g. 2048"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setActiveAgent(null);
                setInvokeForm(EMPTY_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submitInvoke}
              loading={invokeMutation.isPending}
              loadingText="Invoking..."
              disabled={!invokeForm.prompt.trim()}
              icon={<PlayIcon className="h-4 w-4" />}
            >
              Invoke
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch Deploy Modal */}
      <Modal
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        title={`Deploy ${selectedAgents.size} Agents`}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {Array.from(selectedAgents).map((name) => (
              <Badge key={name}>{name}</Badge>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              Shared Prompt <span className="text-[var(--danger)]">*</span>
            </label>
            <textarea
              rows={3}
              value={batchPrompt}
              onChange={(e) => setBatchPrompt(e.target.value)}
              placeholder="Enter a prompt to send to all selected agents..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setBatchModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submitBatch}
              loading={batchMutation.isPending}
              loadingText="Deploying..."
              disabled={!batchPrompt.trim()}
              icon={<PlayIcon className="h-4 w-4" />}
            >
              Deploy All
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm font-medium text-green-800 shadow-lg dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
