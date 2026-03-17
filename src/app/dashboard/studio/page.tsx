"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { api } from "@/lib/trpc-client";
import {
  ConversationSidebar,
  ChatMessageList,
  ChatInput,
  SuggestedPrompts,
  DelegationCard,
} from "@/components/chat";

export default function StudioPage() {
  const utils = api.useUtils();

  /* ------------------------------------------------------------------ */
  /*  State                                                              */
  /* ------------------------------------------------------------------ */

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [assistantMsgId, setAssistantMsgId] = useState<string | null>(null);
  const pendingSendRef = useRef<string | null>(null);

  /* ------------------------------------------------------------------ */
  /*  Queries                                                            */
  /* ------------------------------------------------------------------ */

  const conversations = api.chat.listConversations.useQuery();

  const conversation = api.chat.getConversation.useQuery(
    { id: activeConversationId! },
    { enabled: !!activeConversationId },
  );

  const jobStatus = api.chat.getJobStatus.useQuery(
    { jobId: activeJobId! },
    { enabled: !!activeJobId, refetchInterval: 2000 },
  );

  /* ------------------------------------------------------------------ */
  /*  Mutations                                                          */
  /* ------------------------------------------------------------------ */

  const createConversation = api.chat.createConversation.useMutation({
    onSuccess(data) {
      setActiveConversationId(data.id);
      void utils.chat.listConversations.invalidate();
      // If there's a pending message, send it now
      if (pendingSendRef.current) {
        const msg = pendingSendRef.current;
        pendingSendRef.current = null;
        doSendMessage(data.id, msg);
      }
    },
  });

  const deleteConversation = api.chat.deleteConversation.useMutation({
    onSuccess(_data, variables) {
      if (variables.id === activeConversationId) {
        setActiveConversationId(null);
      }
      void utils.chat.listConversations.invalidate();
    },
  });

  const sendMessage = api.chat.sendMessage.useMutation();
  const invokeOrchestrator = api.chat.invokeOrchestrator.useMutation();
  const addAssistantMessage = api.chat.addAssistantMessage.useMutation();

  /* ------------------------------------------------------------------ */
  /*  Handle job completion                                              */
  /* ------------------------------------------------------------------ */

  const prevJobStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jobStatus.data || !activeJobId || !activeConversationId) return;

    const state = jobStatus.data.state;
    if (prevJobStateRef.current === state) return;
    prevJobStateRef.current = state;

    if (state === "completed") {
      const output = jobStatus.data.output;
      const content =
        typeof output === "object" && output !== null && "result" in output
          ? String((output as Record<string, unknown>).result)
          : "Agent completed the task.";

      addAssistantMessage.mutate(
        {
          conversationId: activeConversationId,
          content,
        },
        {
          onSuccess() {
            // Delete the "Processing…" status message by invalidating
            void utils.chat.getConversation.invalidate({ id: activeConversationId });
            setActiveJobId(null);
            setAssistantMsgId(null);
            prevJobStateRef.current = null;
          },
        },
      );
    } else if (state === "failed") {
      addAssistantMessage.mutate(
        {
          conversationId: activeConversationId,
          content: "Sorry, the agent encountered an error. Please try again.",
          type: "error",
        },
        {
          onSuccess() {
            void utils.chat.getConversation.invalidate({ id: activeConversationId });
            setActiveJobId(null);
            setAssistantMsgId(null);
            prevJobStateRef.current = null;
          },
        },
      );
    }
  }, [
    jobStatus.data,
    activeJobId,
    activeConversationId,
    addAssistantMessage,
    utils.chat.getConversation,
  ]);

  /* ------------------------------------------------------------------ */
  /*  Handlers                                                           */
  /* ------------------------------------------------------------------ */

  const doSendMessage = useCallback(
    (convId: string, content: string) => {
      sendMessage.mutate(
        { conversationId: convId, content },
        {
          onSuccess(msg) {
            void utils.chat.getConversation.invalidate({ id: convId });
            void utils.chat.listConversations.invalidate();
            invokeOrchestrator.mutate(
              { conversationId: convId, messageId: msg.id },
              {
                onSuccess(result) {
                  setActiveJobId(result.jobId);
                  setAssistantMsgId(result.assistantMessageId);
                  void utils.chat.getConversation.invalidate({ id: convId });
                },
              },
            );
          },
        },
      );
    },
    [sendMessage, invokeOrchestrator, utils.chat.getConversation, utils.chat.listConversations],
  );

  const handleSend = useCallback(
    (content: string) => {
      if (!activeConversationId) {
        // No active conversation — create one first, then send via pendingSendRef
        pendingSendRef.current = content;
        createConversation.mutate();
      } else {
        doSendMessage(activeConversationId, content);
      }
    },
    [activeConversationId, createConversation, doSendMessage],
  );

  const handleSelectPrompt = useCallback(
    (prompt: string) => {
      handleSend(prompt);
    },
    [handleSend],
  );

  const handleCreateConversation = useCallback(() => {
    createConversation.mutate(undefined, {
      onSuccess(data) {
        setActiveConversationId(data.id);
        void utils.chat.listConversations.invalidate();
      },
    });
  }, [createConversation, utils.chat.listConversations]);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation.mutate({ id });
    },
    [deleteConversation],
  );

  /* ------------------------------------------------------------------ */
  /*  Derived state                                                      */
  /* ------------------------------------------------------------------ */

  const sidebarConversations = (conversations.data?.conversations ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    lastMessage: c.messages[0] ? { content: c.messages[0].content, role: c.messages[0].role } : null,
  }));

  const messages = (conversation.data?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    type: m.type,
    content: m.content,
    metadata: (m.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: m.createdAt,
  }));
  const conversationTitle = conversation.data?.title ?? "New Conversation";
  const isAgentRunning = !!activeJobId;
  const isSending = sendMessage.isPending || createConversation.isPending;
  const showSuggestedPrompts = !activeConversationId || messages.length === 0;

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex h-[calc(100vh-var(--header-height,64px))] flex-row">
      {/* Sidebar */}
      <div className="w-60 shrink-0">
        <ConversationSidebar
          conversations={sidebarConversations}
          activeId={activeConversationId ?? undefined}
          onSelect={setActiveConversationId}
          onCreate={handleCreateConversation}
          onDelete={handleDeleteConversation}
          isLoading={conversations.isLoading}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-6 py-3">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            {conversationTitle}
          </h1>
          {isAgentRunning && (
            <DelegationCard
              agentName="nexus-orchestrator"
              status="running"
              className="ml-auto"
            />
          )}
        </div>

        {/* Messages or empty state */}
        {showSuggestedPrompts ? (
          <SuggestedPrompts onSelect={handleSelectPrompt} />
        ) : (
          <ChatMessageList
            messages={messages}
            isLoading={isAgentRunning}
          />
        )}

        {/* Input */}
        <div className="border-t border-[var(--border)] px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <ChatInput
              onSend={handleSend}
              disabled={isSending || isAgentRunning}
              placeholder={
                isAgentRunning
                  ? "Waiting for agent response…"
                  : "Ask anything…"
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
