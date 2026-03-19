"use client";

import type { ReactNode } from "react";

/* ── ConversationSidebar ─────────────────────────────────────── */

export interface SidebarConversation {
  id: string;
  title: string | null;
  updatedAt: Date | string;
  lastMessage: { content: string; role: string } | null;
}

export interface ConversationSidebarProps {
  conversations: SidebarConversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  isLoading: boolean;
}

export function ConversationSidebar({ conversations, activeId, onSelect, onCreate, onDelete, isLoading }: ConversationSidebarProps) {
  return (
    <div className="flex h-full flex-col border-r border-[var(--border)] bg-[var(--card-bg)] p-2">
      <button onClick={onCreate} className="mb-2 w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white">
        New Chat
      </button>
      {isLoading ? (
        <p className="text-xs text-[var(--text-muted)]">Loading…</p>
      ) : (
        conversations.map((c) => (
          <div
            key={c.id}
            className={`flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm ${c.id === activeId ? "bg-[var(--accent)]" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            <span className="truncate">{c.title}</span>
            <button onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} className="text-xs text-red-500">×</button>
          </div>
        ))
      )}
    </div>
  );
}

/* ── ChatMessageList ─────────────────────────────────────────── */

export interface ChatMessage {
  id: string;
  role: string;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date | string;
}

export interface ChatMessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
}

export function ChatMessageList({ messages, isLoading }: ChatMessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((m) => (
        <div key={m.id} className={`mb-3 text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
          <span className="inline-block max-w-[80%] rounded-lg bg-[var(--card-bg)] p-2">{m.content}</span>
        </div>
      ))}
      {isLoading && <p className="text-xs text-[var(--text-muted)]">Agent is thinking…</p>}
    </div>
  );
}

/* ── ChatInput ───────────────────────────────────────────────── */

export interface ChatInputProps {
  onSend: (content: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const input = form.elements.namedItem("message") as HTMLInputElement;
        const value = input.value.trim();
        if (value) {
          try {
            await onSend(value);
            input.value = "";
          } catch {
            // Leave input intact so the user's message is not lost.
            // The caller (handleSend) is responsible for surfacing errors.
          }
        }
      }}
      className="flex gap-2"
    >
      <input
        name="message"
        disabled={disabled}
        placeholder={placeholder ?? "Type a message…"}
        className="flex-1 rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
      />
      <button type="submit" disabled={disabled} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
        Send
      </button>
    </form>
  );
}

/* ── SuggestedPrompts ────────────────────────────────────────── */

export interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

const SAMPLE_PROMPTS = [
  "Help me create a content calendar",
  "Analyze my recent post performance",
  "Write a script for a short-form video",
];

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">How can I help?</h2>
      <div className="flex flex-wrap gap-2">
        {SAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── DelegationCard ──────────────────────────────────────────── */

export interface DelegationCardProps {
  agentName: string;
  status: string;
  className?: string;
}

export function DelegationCard({ agentName, status, className }: DelegationCardProps) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-3 py-1.5 text-sm ${className ?? ""}`}>
      <span className="h-2 w-2 rounded-full bg-green-500" />
      <span className="font-medium">{agentName}</span>
      <span className="text-[var(--text-muted)]">{status}</span>
    </div>
  );
}

/* ── StudioGlobalWrapper ─────────────────────────────────────── */

export interface StudioGlobalWrapperProps {
  children?: ReactNode;
}

export function StudioGlobalWrapper({ children }: StudioGlobalWrapperProps) {
  return <>{children}</>;
}
