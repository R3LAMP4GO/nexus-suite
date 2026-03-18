"use client";

export interface WorkflowCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function WorkflowCreateModal({ open, onClose, onCreated }: WorkflowCreateModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-[var(--card-bg)] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Create Workflow</h2>
        <p className="mb-4 text-sm text-[var(--text-muted)]">Workflow creation form placeholder</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-[var(--border)] px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => { onCreated(); onClose(); }}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
