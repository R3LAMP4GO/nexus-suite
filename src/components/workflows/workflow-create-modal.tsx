"use client";

import { useState } from "react";
import { api } from "@/lib/trpc-client";

export interface WorkflowCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function WorkflowCreateModal({ open, onClose, onCreated }: WorkflowCreateModalProps) {
  const [name, setName] = useState("");
  const [yaml, setYaml] = useState("");
  const [errors, setErrors] = useState<{ name?: string; yaml?: string }>({});

  const createMutation = api.workflows.create.useMutation({
    onSuccess: () => {
      setName("");
      setYaml("");
      setErrors({});
      onCreated();
      onClose();
    },
  });

  if (!open) return null;

  function validate(): boolean {
    const next: { name?: string; yaml?: string } = {};
    if (!name.trim()) next.name = "Name is required";
    if (!yaml.trim()) next.yaml = "YAML is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    createMutation.reset();
    createMutation.mutate({ name: name.trim(), yaml: yaml.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-[var(--card-bg)] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Create Workflow</h2>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
            placeholder="my-workflow"
            className="w-full rounded border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-blue-500"
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">YAML</label>
          <textarea
            value={yaml}
            onChange={(e) => { setYaml(e.target.value); setErrors((p) => ({ ...p, yaml: undefined })); }}
            rows={10}
            placeholder={"name: my-workflow\ntrigger:\n  type: manual\nsteps:\n  - ..."}
            className="w-full rounded border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-blue-500"
          />
          {errors.yaml && <p className="mt-1 text-xs text-red-500">{errors.yaml}</p>}
        </div>

        {createMutation.error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {createMutation.error.message}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => { createMutation.reset(); setErrors({}); onClose(); }}
            className="rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
