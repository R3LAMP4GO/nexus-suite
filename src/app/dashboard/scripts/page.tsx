"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc-client";
import {
  Badge,
  Button,
  Modal,
  FormField,
  Skeleton,
  SkeletonCard,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  useToast,
} from "@/components/ui/index";
import { FileText, Check, Plus, Trash2, X as XIcon } from "@/components/icons";
import type { ScriptStatus } from "@/generated/prisma/client";

/* ── Types ───────────────────────────────────────────────────── */

type Script = {
  id: string;
  title: string;
  hookText: string;
  bodyText: string;
  ctaText: string;
  status: ScriptStatus;
  createdAt: Date;
  updatedAt: Date;
  organizationId: string;
};

/* ── Helpers ─────────────────────────────────────────────────── */

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TAB_FILTERS: { label: string; value: string; status?: ScriptStatus }[] = [
  { label: "All Scripts", value: "all" },
  { label: "Drafts", value: "DRAFT", status: "DRAFT" as ScriptStatus },
  { label: "Approved", value: "APPROVED", status: "APPROVED" as ScriptStatus },
  { label: "Archived", value: "ARCHIVED", status: "ARCHIVED" as ScriptStatus },
];

/* ── Script Detail Modal ─────────────────────────────────────── */

function ScriptDetailModal({
  script,
  open,
  onClose,
  onApprove,
  onArchive,
  isApproving,
  isArchiving,
}: {
  script: Script | null;
  open: boolean;
  onClose: () => void;
  onApprove: () => void;
  onArchive: () => void;
  isApproving: boolean;
  isArchiving: boolean;
}) {
  if (!script) return null;

  return (
    <Modal open={open} onClose={onClose} title={script.title} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Status + Date */}
        <div className="flex items-center gap-3">
          <Badge colorMap="status" value={script.status} />
          <span className="text-xs text-[var(--text-muted)]">
            Created {formatDate(script.createdAt)}
          </span>
        </div>

        {/* Hook */}
        <div>
          <h3 className="mb-1 text-sm font-semibold text-[var(--text-secondary)]">
            Hook (0–3s)
          </h3>
          <p className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-sm text-[var(--text-primary)]">
            {script.hookText}
          </p>
        </div>

        {/* Body */}
        <div>
          <h3 className="mb-1 text-sm font-semibold text-[var(--text-secondary)]">
            Body
          </h3>
          <p className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-sm text-[var(--text-primary)]">
            {script.bodyText}
          </p>
        </div>

        {/* CTA */}
        <div>
          <h3 className="mb-1 text-sm font-semibold text-[var(--text-secondary)]">
            Call to Action
          </h3>
          <p className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-sm text-[var(--text-primary)]">
            {script.ctaText}
          </p>
        </div>

        {/* Actions */}
        {script.status === "DRAFT" && (
          <div className="flex items-center gap-3 border-t border-[var(--border)] pt-4">
            <Button
              variant="primary"
              size="sm"
              loading={isApproving}
              loadingText="Approving..."
              icon={<Check className="h-4 w-4" />}
              onClick={onApprove}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={isArchiving}
              loadingText="Archiving..."
              icon={<XIcon className="h-4 w-4" />}
              onClick={onArchive}
            >
              Archive
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── Create Script Modal ──────────────────────────────────────── */

const EMPTY_FORM = { title: "", hookText: "", bodyText: "", ctaText: "" };

function CreateScriptModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<typeof EMPTY_FORM>>({});

  const { toast } = useToast();
  const create = api.scripts.create.useMutation({
    onSuccess: () => {
      void utils.scripts.list.invalidate();
      setForm(EMPTY_FORM);
      setErrors({});
      onClose();
      toast("Script created", { type: "success" });
    },
  });

  const validate = () => {
    const e: Partial<typeof EMPTY_FORM> = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.hookText.trim()) e.hookText = "Hook text is required";
    if (!form.bodyText.trim()) e.bodyText = "Body text is required";
    if (!form.ctaText.trim()) e.ctaText = "CTA text is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    create.mutate({
      title: form.title.trim(),
      hookText: form.hookText.trim(),
      bodyText: form.bodyText.trim(),
      ctaText: form.ctaText.trim(),
    });
  };

  const inputClass =
    "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

  return (
    <Modal open={open} onClose={onClose} title="New Script" maxWidth="max-w-xl">
      <div className="space-y-4">
        <FormField label="Title" error={errors.title} required>
          <input
            className={inputClass}
            placeholder="Script title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </FormField>

        <FormField label="Hook (0–3s)" error={errors.hookText} required>
          <textarea
            className={inputClass + " min-h-[80px] resize-y"}
            placeholder="Opening hook to grab attention..."
            value={form.hookText}
            onChange={(e) => setForm((f) => ({ ...f, hookText: e.target.value }))}
          />
        </FormField>

        <FormField label="Body" error={errors.bodyText} required>
          <textarea
            className={inputClass + " min-h-[120px] resize-y"}
            placeholder="Main body of the script..."
            value={form.bodyText}
            onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
          />
        </FormField>

        <FormField label="Call to Action" error={errors.ctaText} required>
          <textarea
            className={inputClass + " min-h-[80px] resize-y"}
            placeholder="Call to action..."
            value={form.ctaText}
            onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))}
          />
        </FormField>

        {create.error && (
          <p className="text-sm text-[var(--danger)]">{create.error.message}</p>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={create.isPending}
            loadingText="Creating..."
            icon={<Plus className="h-4 w-4" />}
            onClick={handleSubmit}
          >
            Create Script
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Delete Confirmation Modal ───────────────────────────────── */

function DeleteConfirmModal({
  scriptTitle,
  open,
  onClose,
  onConfirm,
  isDeleting,
}: {
  scriptTitle: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Delete Script">
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Are you sure you want to delete <strong>&ldquo;{scriptTitle}&rdquo;</strong>?
          This action cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={isDeleting}
            loadingText="Deleting..."
            icon={<Trash2 className="h-4 w-4" />}
            onClick={onConfirm}
          >
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Script Row ──────────────────────────────────────────────── */

function ScriptRow({
  script,
  onView,
  onApprove,
  onArchive,
  onDelete,
  isApproving,
  isArchiving,
}: {
  script: Script;
  onView: () => void;
  onApprove: () => void;
  onArchive: () => void;
  onDelete: () => void;
  isApproving: boolean;
  isArchiving: boolean;
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-4 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm transition hover:border-[var(--border-hover)]"
      onClick={onView}
    >
      {/* Icon */}
      <div className="rounded-lg bg-[var(--bg-tertiary)] p-2">
        <FileText className="h-5 w-5 text-indigo-500" />
      </div>

      {/* Title + date */}
      <div className="min-w-0 flex-1">
        <Link
          href={`/dashboard/scripts/${script.id}`}
          className="block truncate text-sm font-medium text-[var(--text-primary)] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {script.title}
        </Link>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {formatDate(script.createdAt)}
        </p>
      </div>

      {/* Status badge */}
      <Badge colorMap="status" value={script.status} />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {script.status === "DRAFT" && (
          <>
            <Button
              variant="primary"
              size="sm"
              loading={isApproving}
              loadingText="..."
              icon={<Check className="h-3.5 w-3.5" />}
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={isArchiving}
              loadingText="..."
              icon={<XIcon className="h-3.5 w-3.5" />}
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
            >
              Archive
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete script"
        />
      </div>
    </div>
  );
}

/* ── Loading Skeleton ────────────────────────────────────────── */

function ScriptListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm"
        >
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ── Empty State ─────────────────────────────────────────────── */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] p-16 text-center">
      <FileText className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
      <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">
        {message}
      </h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Scripts will appear here once generated by your agents.
      </p>
    </div>
  );
}

/* ── Script List (per-tab) ───────────────────────────────────── */

function ScriptList({ status }: { status?: ScriptStatus }) {
  const utils = api.useUtils();
  const { toast } = useToast();
  const scripts = api.scripts.list.useQuery(
    status ? { status } : undefined,
  );

  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Script | null>(null);

  const approve = api.scripts.update.useMutation({
    onSuccess: () => {
      void utils.scripts.list.invalidate();
      setSelectedScript(null);
      setActionId(null);
      toast("Script approved", { type: "success" });
    },
    onError: (err) => toast(err.message, { type: "error" }),
  });

  const archive = api.scripts.update.useMutation({
    onSuccess: () => {
      void utils.scripts.list.invalidate();
      setSelectedScript(null);
      setActionId(null);
      toast("Script archived", { type: "success" });
    },
    onError: (err) => toast(err.message, { type: "error" }),
  });

  const deleteMut = api.scripts.delete.useMutation({
    onSuccess: () => {
      void utils.scripts.list.invalidate();
      setDeleteTarget(null);
      toast("Script deleted", { type: "success" });
    },
    onError: (err) => toast(err.message, { type: "error" }),
  });

  const handleApprove = (id: string) => {
    setActionId(id);
    approve.mutate({ id, status: "APPROVED" as ScriptStatus });
  };

  const handleArchive = (id: string) => {
    setActionId(id);
    archive.mutate({ id, status: "ARCHIVED" as ScriptStatus });
  };

  if (scripts.isLoading) return <ScriptListSkeleton />;

  if (!scripts.data?.length) {
    const msg = status
      ? `No ${status.toLowerCase()} scripts`
      : "No scripts yet";
    return <EmptyState message={msg} />;
  }

  return (
    <>
      <div className="space-y-3">
        {scripts.data.map((script: Script) => (
          <ScriptRow
            key={script.id}
            script={script}
            onView={() => setSelectedScript(script)}
            onApprove={() => handleApprove(script.id)}
            onArchive={() => handleArchive(script.id)}
            onDelete={() => setDeleteTarget(script)}
            isApproving={approve.isPending && actionId === script.id}
            isArchiving={archive.isPending && actionId === script.id}
          />
        ))}
      </div>

      <ScriptDetailModal
        script={selectedScript}
        open={!!selectedScript}
        onClose={() => setSelectedScript(null)}
        onApprove={() => selectedScript && handleApprove(selectedScript.id)}
        onArchive={() => selectedScript && handleArchive(selectedScript.id)}
        isApproving={approve.isPending && actionId === selectedScript?.id}
        isArchiving={archive.isPending && actionId === selectedScript?.id}
      />

      <DeleteConfirmModal
        scriptTitle={deleteTarget?.title ?? ""}
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate({ id: deleteTarget.id })}
        isDeleting={deleteMut.isPending}
      />
    </>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

export default function ScriptsPage() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">
              Scripts
            </h1>
            <p className="mt-1 text-[var(--text-muted)]">
              Review and approve AI-generated scripts before they go live
            </p>
          </div>
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreate(true)}
          >
            New Script
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all">
          <TabsList>
            {TAB_FILTERS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TAB_FILTERS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <ScriptList status={tab.status} />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <CreateScriptModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
