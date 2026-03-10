"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UseMutationResult } from "@tanstack/react-query";

const PLATFORMS = [
  "YOUTUBE",
  "TIKTOK",
  "INSTAGRAM",
  "LINKEDIN",
  "X",
  "FACEBOOK",
] as const;

export type SourceVideo = {
  id: string;
  url: string;
  platform: string;
  createdAt: string | Date;
};

interface SourceTabProps {
  sources: SourceVideo[];
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
  uploadSource: UseMutationResult<any, any, any, any>;
}

export function SourceTab({
  sources,
  selectedSourceId,
  onSelectSource,
  uploadSource,
}: SourceTabProps) {
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("YOUTUBE");

  return (
    <div className="space-y-6">
      {/* Upload Form */}
      <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
          Upload Source
        </h2>
        <div className="flex gap-3">
          <input
            type="url"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:border-[var(--accent)] focus:outline-none"
          />
          <select
            value={platform}
            onChange={(e) =>
              setPlatform(e.target.value as (typeof PLATFORMS)[number])
            }
            className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:border-[var(--accent)] focus:outline-none"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <Button
            onClick={() => {
              uploadSource.mutate({ url, platform });
              setUrl("");
            }}
            disabled={!url}
            loading={uploadSource.isPending}
            loadingText="Uploading..."
          >
            Upload
          </Button>
        </div>
        {uploadSource.error && (
          <p className="mt-2 text-sm text-[var(--danger)]">
            {uploadSource.error.message}
          </p>
        )}
      </div>

      {/* Source Videos List */}
      {sources.length > 0 && (
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm">
          <div className="border-b border-[var(--border)] px-6 py-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Source Videos
            </h2>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {sources.map((src) => (
              <li key={src.id}>
                <button
                  onClick={() => onSelectSource(src.id)}
                  className={`flex w-full items-center gap-4 px-6 py-3 text-left transition hover:bg-[var(--bg-tertiary)] ${
                    selectedSourceId === src.id
                      ? "bg-[var(--bg-tertiary)]"
                      : ""
                  }`}
                >
                  <Badge colorMap="platform" value={src.platform} />
                  <span className="flex-1 truncate text-sm text-[var(--text-secondary)]">
                    {src.url}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {src.id.slice(0, 8)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
