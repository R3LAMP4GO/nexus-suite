"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/trpc-client";
import {
  Badge,
  Button,
  FormField,
  Modal,
  Skeleton,
  useToast,
} from "@/components/ui/index";
import { Check, Pencil, Trash2, X as XIcon } from "@/components/icons";
import type { ScriptStatus } from "@/generated/prisma/client";

/* ── Helpers ─────────────────────────────────────────────────── */

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const INPUT_CLASS =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

/* ── Loading Skeleton ────────────────────────────────────────── */

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-5 w-32 rounded-full" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Edit Modal ──────────────────────────────────────────────── */

function EditScriptModal({
  script,
  open,
  onClose,
}: {
  script: { id: string; title: string; hookText: string; bodyText: string; ctaText: string };
  open: boolean;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const [form, setForm] = useState({
    title: script.title,
    hookText: script.hookText,
    bodyText: script.bodyText,
    ctaText: script.ctaText,
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});

  const { toast } = useToast();
  const update = api.scripts.update.useMutation({
    onSuccess: () => {
      void utils.scripts.getById.invalidate({ id: script.id });
      void utils.scripts.list.invalidate();
      onClose();
      toast("Script updated", { type: "success" });
    },
  });

  const validate = () => {
    const e: Partial<typeof form> = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.hookText.trim()) e.hookText = "Hook text is required";
    if (!form.bodyText.trim()) e.bodyText = "Body text is required";
    if (!form.ctaText.trim()) e.ctaText = "CTA text is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    update.mutate({
      id: script.id,
      title: form.title.trim(),
      hookText: form.hookText.trim(),
      bodyText: form.bodyText.trim(),
      ctaText: form.ctaText.trim(),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Script" maxWidth="max-w-xl">
      <div className="space-y-4">
        <FormField label="Title" error={errors.title} required>
          <input
            className={INPUT_CLASS}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </FormField>

        <FormField label="Hook (0–3s)" error={errors.hookText} required>
          <textarea
            className={INPUT_CLASS + " min-h-[80px] resize-y"}
            value={form.hookText}
            onChange={(e) => setForm((f) => ({ ...f, hookText: e.target.value }))}
          />
        </FormField>

        <FormField label="Body" error={errors.bodyText} required>
          <textarea
            className={INPUT_CLASS + " min-h-[120px] resize-y"}
            value={form.bodyText}
            onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
          />
        </FormField>

        <FormField label="Call to Action" error={errors.ctaText} required>
          <textarea
            className={INPUT_CLASS + " min-h-[80px] resize-y"}
            value={form.ctaText}
            onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))}
          />
        </FormField>

        {update.error && (
          <p className="text-sm text-[var(--danger)]">{update.error.message}</p>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={update.isPending}
            loadingText="Saving..."
            onClick={handleSubmit}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

export default function ScriptDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = api.useUtils();

  const { toast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const script = api.scripts.getById.useQuery({ id: params.id });

  const approve = api.scripts.update.useMutation({
    onSuccess: () => {
      void utils.scripts.getById.invalidate({ id: params.id });
      void utils.scripts.list.invalidate();
      toast("Script approved", { type: "success" });
    },
    onError: (err) => toast(err.message, { type: "error" }),
  });

  const archive = api.scripts.update.useMutation({
    onSuccess: () => {
      void utils.scripts.getById.invalidate({ id: params.id });
      void utils.scripts.list.invalidate();
      toast("Script archived", { type: "success" });
    },
    onError: (err) => toast(err.message, { type: "error" }),
  });

  const deleteMut = api.scripts.delete.useMutation({
    onSuccess: () => {
      void utils.scripts.list.invalidate();
      toast("Script deleted", { type: "success" });
      router.push("/dashboard/scripts");
    },
    onError: (err) => toast(err.message, { type: "error" }),
  });

  if (script.isLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-3xl">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (script.error || !script.data) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Script not found
          </h1>
          <p className="mt-2 text-[var(--text-muted)]">
            {script.error?.message ?? "This script may have been deleted."}
          </p>
          <Link
            href="/dashboard/scripts"
            className="mt-4 inline-block text-sm text-[var(--accent)] hover:underline"
          >
            ← Back to Scripts
          </Link>
        </div>
      </div>
    );
  }

  const s = script.data;

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl">
        {/* Breadcrumb */}
        <Link
          href="/dashboard/scripts"
          className="mb-6 inline-block text-sm text-[var(--accent)] hover:underline"
        >
          ← Back to Scripts
        </Link>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {s.title}
            </h1>
            <div className="mt-2 flex items-center gap-3">
              <Badge colorMap="status" value={s.status} />
              <span className="text-xs text-[var(--text-muted)]">
                Created {formatDate(s.createdAt)} · Updated {formatDate(s.updatedAt)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => setShowEdit(true)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />}
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="Delete script"
            />
          </div>
        </div>

        {/* Script sections — teleprompter style */}
        <div className="space-y-4">
          {/* Hook */}
          <div className="rounded-lg border-l-4 border-purple-500 bg-purple-50 p-4 dark:bg-purple-900/20">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
              Hook · 0-3s
            </p>
            <p className="text-lg font-bold leading-relaxed text-[var(--text-primary)]">
              {s.hookText}
            </p>
          </div>

          {/* Body */}
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-900/20">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Body
            </p>
            <p className="whitespace-pre-wrap text-base leading-relaxed text-[var(--text-secondary)]">
              {s.bodyText}
            </p>
          </div>

          {/* CTA */}
          <div className="rounded-lg border-l-4 border-green-500 bg-green-50 p-4 dark:bg-green-900/20">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
              Call to Action
            </p>
            <p className="text-lg font-semibold leading-relaxed text-[var(--text-primary)]">
              {s.ctaText}
            </p>
          </div>
        </div>

        {/* Status Actions */}
        {s.status === ("DRAFT" as ScriptStatus) && (
          <div className="mt-6 flex items-center gap-3 border-t border-[var(--border)] pt-6">
            <Button
              variant="primary"
              icon={<Check className="h-4 w-4" />}
              loading={approve.isPending}
              loadingText="Approving..."
              onClick={() => approve.mutate({ id: s.id, status: "APPROVED" as ScriptStatus })}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              icon={<XIcon className="h-4 w-4" />}
              loading={archive.isPending}
              loadingText="Archiving..."
              onClick={() => archive.mutate({ id: s.id, status: "ARCHIVED" as ScriptStatus })}
            >
              Archive
            </Button>
          </div>
        )}

        {/* Edit Modal */}
        {showEdit && (
          <EditScriptModal
            script={s}
            open={showEdit}
            onClose={() => setShowEdit(false)}
          />
        )}

        {/* Delete Confirmation */}
        <Modal
          open={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          title="Delete Script"
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to delete <strong>&ldquo;{s.title}&rdquo;</strong>?
              This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleteMut.isPending}
                loadingText="Deleting..."
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => deleteMut.mutate({ id: s.id })}
              >
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
