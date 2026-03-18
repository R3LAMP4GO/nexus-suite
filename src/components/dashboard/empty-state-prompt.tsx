"use client";

import type { ReactNode } from "react";

export interface EmptyStatePromptProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: ReactNode;
}

export function EmptyStatePrompt({ title, description, actionLabel, actionHref, icon }: EmptyStatePromptProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      {icon && <div className="text-[var(--text-muted)]">{icon}</div>}
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="text-sm text-[var(--text-muted)]">{description}</p>
      {actionLabel && actionHref && (
        <a href={actionHref} className="text-sm font-medium text-blue-600 hover:underline">
          {actionLabel}
        </a>
      )}
    </div>
  );
}
