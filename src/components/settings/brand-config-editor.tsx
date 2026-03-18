"use client";

export interface BrandConfigEditorProps {
  initialConfig: Record<string, any> | null;
}

export function BrandConfigEditor({ initialConfig }: BrandConfigEditorProps) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
      <p className="text-sm text-[var(--text-muted)]">
        BrandConfigEditor — {initialConfig ? Object.keys(initialConfig).length + " keys" : "No config"}
      </p>
    </div>
  );
}
