"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/trpc-client";
import { useToast } from "@/components/ui/toast";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  ConversationSidebar,
  ChatMessageList,
  ChatInput,
  SuggestedPrompts,
  DelegationCard,
} from "@/components/chat";

/* ── Polling helper ─────────────────────────────────────────── */

function useJobPoller(onComplete: (jobId: string, output: Record<string, unknown> | null) => void) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const statusQuery = api.chat.getJobStatus.useQuery(
    { jobId: activeJobId! },
    {
      enabled: !!activeJobId,
      refetchInterval: (query) =>
        query.state.status === "error" ? false : 1000,
    },
  );

  // Derive completion / error state and schedule cleanup via a microtask
  // so we avoid synchronous setState inside the effect body (react-hooks/set-state-in-effect).
  const shouldClear =
    !!activeJobId &&
    (statusQuery.isError ||
      (statusQuery.data != null && statusQuery.data.state !== "pending"));

  useEffect(() => {
    if (!shouldClear || !activeJobId) return;
    if (!statusQuery.isError && statusQuery.data) {
      onCompleteRef.current(activeJobId, statusQuery.data.output);
    }
    // Use queueMicrotask to avoid synchronous setState in the effect body
    queueMicrotask(() => setActiveJobId(null));
  }, [shouldClear, activeJobId, statusQuery.isError, statusQuery.data]);

  return { setActiveJobId, isPolling: !!activeJobId };
}

/* ── Script Viewer (extracted) ──────────────────────────────── */

function ScriptViewer() {
  const scripts = api.scripts.list.useQuery({ status: "APPROVED" });

  if (scripts.isLoading) {
    return (
      <div className="space-y-6 p-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!scripts.data?.length) {
    return (
      <div className="p-6">
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-[var(--text-muted)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-[var(--text-primary)]">
            No approved scripts yet
          </h3>
          <p className="mt-2 text-[var(--text-muted)]">
            Your team will prepare scripts for you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      {scripts.data.map((script) => (
        <div
          key={script.id}
          className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm transition hover:shadow-md"
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              {script.title}
            </h2>
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
              ✓ Ready to Record
            </span>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border-l-4 border-purple-500 bg-purple-50 p-4 dark:bg-purple-900/20">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
                Hook · 0-3s
              </p>
              <p className="text-lg font-bold leading-relaxed text-[var(--text-primary)]">
                {script.hookText}
              </p>
            </div>
            <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-900/20">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                Body
              </p>
              <p className="text-base leading-relaxed text-[var(--text-secondary)]">
                {script.bodyText}
              </p>
            </div>
            <div className="rounded-lg border-l-4 border-green-500 bg-green-50 p-4 dark:bg-green-900/20">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
                Call to Action
              </p>
              <p className="text-lg font-semibold leading-relaxed text-[var(--text-primary)]">
                {script.ctaText}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Tab button ──────────────────────────────────────────────── */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-b-2 border-blue-600 text-blue-600"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Main Studio Page ───────────────────────────────────────── */

export default function StudioPage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "scripts">("chat");
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);

  const utils = api.useUtils();

  /* ── Queries ── */
  const conversationsQuery = api.chat.listConversations.useQuery();
  const conversationQuery = api.chat.getConversation.useQuery(
    { id: activeConversationId! },
    { enabled: !!activeConversationId },
  );

  /* ── Mutations ── */
  const { toast } = useToast();

  const createConversation = api.chat.createConversation.useMutation({
    onSuccess: (conv) => {
      setActiveConversationId(conv.id);
      utils.chat.listConversations.invalidate();
      toast("Conversation created", { type: "success" });
    },
  });

  const deleteConversation = api.chat.deleteConversation.useMutation({
    onSuccess: (_, vars) => {
      if (activeConversationId === vars.id) setActiveConversationId(null);
      utils.chat.listConversations.invalidate();
      toast("Conversation deleted", { type: "success" });
    },
  });

  const sendMessage = api.chat.sendMessage.useMutation({
    onError: () => {
      toast("Failed to send message. Please try again.", { type: "error" });
    },
  });
  const invokeOrchestrator = api.chat.invokeOrchestrator.useMutation({
    onError: () => {
      toast("Failed to start the orchestrator. Please try again.", { type: "error" });
    },
  });
  const addAssistantMessage = api.chat.addAssistantMessage.useMutation({
    onSuccess: () => {
      if (activeConversationId) {
        utils.chat.getConversation.invalidate({ id: activeConversationId });
      }
    },
  });

  /* ── Job polling ── */
  const handleJobComplete = useCallback(
    (jobId: string, output: Record<string, unknown> | null) => {
      if (!pendingConversationId) return;
      const content =
        (output as Record<string, unknown> | null)?.result?.toString() ??
        (output as Record<string, unknown> | null)?.content?.toString() ??
        "Task completed.";
      addAssistantMessage.mutate({
        conversationId: pendingConversationId,
        content,
      });
      setPendingConversationId(null);
    },
    [pendingConversationId, addAssistantMessage],
  );

  const { setActiveJobId, isPolling } = useJobPoller(handleJobComplete);

  /* ── Send flow ── */
  const handleSend = useCallback(
    async (content: string) => {
      try {
        let convId = activeConversationId;

        // Auto-create conversation if none active
        if (!convId) {
          const conv = await createConversation.mutateAsync();
          convId = conv.id;
          setActiveConversationId(convId);
        }

        // 1. Send user message
        const msg = await sendMessage.mutateAsync({
          conversationId: convId,
          content,
        });

        // Optimistically refresh messages
        utils.chat.getConversation.invalidate({ id: convId });

        // 2. Invoke orchestrator
        const { jobId } = await invokeOrchestrator.mutateAsync({
          conversationId: convId,
          messageId: msg.id,
        });

        // 3. Start polling
        setPendingConversationId(convId);
        setActiveJobId(jobId);
      } catch (err) {
        // onError handlers on individual mutations already fire toasts,
        // but surface a fallback for unexpected failures (e.g. createConversation).
        const message =
          err instanceof Error ? err.message : "Something went wrong";
        toast(`Failed to send: ${message}`, { type: "error", duration: 6000 });
        // Re-throw so ChatInput keeps the user's text in the input field.
        throw err;
      }
    },
    [
      activeConversationId,
      createConversation,
      sendMessage,
      invokeOrchestrator,
      utils,
      setActiveJobId,
      toast,
    ],
  );

  /* ── Sidebar data ── */
  const sidebarConversations = (conversationsQuery.data?.conversations ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    lastMessage: c.messages?.[0]
      ? { content: c.messages[0].content, role: c.messages[0].role }
      : null,
  }));

  const messages = conversationQuery.data?.messages ?? [];
  const isBusy =
    sendMessage.isPending || invokeOrchestrator.isPending || isPolling;

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Left panel — Conversation Sidebar */}
      <div className="w-64 flex-shrink-0">
        <ConversationSidebar
          conversations={sidebarConversations}
          activeId={activeConversationId ?? undefined}
          onSelect={(id) => {
            setActiveConversationId(id);
            setActiveTab("chat");
          }}
          onCreate={() => createConversation.mutate()}
          onDelete={(id) => deleteConversation.mutate({ id })}
          isLoading={conversationsQuery.isLoading}
        />
      </div>

      {/* Right panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] bg-[var(--card-bg)]">
          <TabButton active={activeTab === "chat"} onClick={() => setActiveTab("chat")}>
            Chat
          </TabButton>
          <TabButton active={activeTab === "scripts"} onClick={() => setActiveTab("scripts")}>
            Scripts
          </TabButton>

          {/* Delegation indicator */}
          {isPolling && (
            <div className="ml-auto flex items-center pr-4">
              <DelegationCard agentName="Orchestrator" status="Processing…" />
            </div>
          )}
        </div>

        {/* Tab content */}
        {activeTab === "scripts" ? (
          <div className="flex-1 overflow-y-auto">
            <ScriptViewer />
          </div>
        ) : !activeConversationId ? (
          /* No conversation selected — show prompts */
          <SuggestedPrompts onSelect={(prompt) => handleSend(prompt)} />
        ) : (
          /* Active conversation */
          <div className="flex flex-1 flex-col overflow-hidden">
            <ChatMessageList
              messages={messages}
              isLoading={isBusy}
            />
            <div className="border-t border-[var(--border)] bg-[var(--card-bg)] p-4">
              <ChatInput
                onSend={handleSend}
                disabled={isBusy}
                placeholder="Ask the studio agent…"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
