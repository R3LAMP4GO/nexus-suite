"use client";

import { useState } from "react";
import { api } from "@/lib/trpc-client";

const PLATFORMS = [
  "YOUTUBE",
  "TIKTOK",
  "INSTAGRAM",
  "LINKEDIN",
  "X",
  "FACEBOOK",
] as const;

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

const PLATFORM_COLORS: Record<string, string> = {
  YOUTUBE: "bg-red-100 text-red-800",
  TIKTOK: "bg-gray-900 text-white",
  INSTAGRAM: "bg-pink-100 text-pink-800",
  LINKEDIN: "bg-blue-100 text-blue-800",
  X: "bg-gray-100 text-gray-800",
  FACEBOOK: "bg-blue-50 text-blue-700",
};

type SourceVideo = {
  id: string;
  url: string;
  platform: string;
  createdAt: string | Date;
};

export default function MultiplierPage() {
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("YOUTUBE");
  const [sources, setSources] = useState<SourceVideo[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [variationCount, setVariationCount] = useState(5);
  const [selectedVariationIds, setSelectedVariationIds] = useState<Set<string>>(new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [startAt, setStartAt] = useState("");

  const uploadSource = api.multiplier.uploadSource.useMutation({
    onSuccess: (data) => {
      const src = data as unknown as SourceVideo;
      setSources((prev) => [src, ...prev]);
      setSelectedSourceId(src.id);
      setUrl("");
    },
  });

  const generateVariations = api.multiplier.generateVariations.useMutation({
    onSuccess: () => {
      void variations.refetch();
    },
  });

  const variations = api.multiplier.getVariations.useQuery(
    { sourceVideoId: selectedSourceId! },
    { enabled: !!selectedSourceId, refetchInterval: 5000 },
  );

  const accounts = api.settings.listPlatformTokens.useQuery();

  const scheduleDistribution = api.multiplier.scheduleDistribution.useMutation({
    onSuccess: () => {
      setSelectedVariationIds(new Set());
      setSelectedAccountIds(new Set());
      void distributionStatus.refetch();
    },
  });

  const distributionStatus = api.multiplier.getDistributionStatus.useQuery(
    { sourceVideoId: selectedSourceId ?? undefined },
    { enabled: !!selectedSourceId, refetchInterval: 10000 },
  );

  const doneVariations = (variations.data ?? []).filter((v: any) => v.status === "DONE");

  const toggleVariation = (id: string) => {
    setSelectedVariationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Multiplier</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload source videos, generate variations, schedule distribution
          </p>
        </div>

        {/* Upload Form */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Upload Source</h2>
          <div className="flex gap-3">
            <input
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button
              onClick={() => uploadSource.mutate({ url, platform })}
              disabled={!url || uploadSource.isPending}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              {uploadSource.isPending ? "Uploading..." : "Upload"}
            </button>
          </div>
          {uploadSource.error && (
            <p className="mt-2 text-sm text-red-600">{uploadSource.error.message}</p>
          )}
        </div>

        {/* Source Videos List */}
        {sources.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Source Videos</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {sources.map((src) => (
                <li key={src.id}>
                  <button
                    onClick={() => setSelectedSourceId(src.id)}
                    className={`flex w-full items-center gap-4 px-6 py-3 text-left transition hover:bg-gray-50 ${selectedSourceId === src.id ? "bg-gray-100" : ""}`}
                  >
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                      {src.platform}
                    </span>
                    <span className="flex-1 truncate text-sm text-gray-700">{src.url}</span>
                    <span className="text-xs text-gray-400">{src.id.slice(0, 8)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Variation Generation Panel */}
        {selectedSourceId && (
          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Generate Variations</h2>
            <div className="mb-6 flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Count</label>
              <input
                type="number"
                min={1}
                max={20}
                value={variationCount}
                onChange={(e) => setVariationCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                className="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
              <button
                onClick={() =>
                  generateVariations.mutate({
                    sourceVideoId: selectedSourceId,
                    count: variationCount,
                  })
                }
                disabled={generateVariations.isPending}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {generateVariations.isPending ? "Generating..." : "Generate Variations"}
              </button>
            </div>
            {generateVariations.error && (
              <p className="mb-4 text-sm text-red-600">{generateVariations.error.message}</p>
            )}

            {/* Variations Status Grid */}
            {variations.data && variations.data.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700">Variations</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {variations.data.map((v: any) => (
                    <div
                      key={v.id}
                      className="rounded-md border border-gray-200 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          #{v.variationIndex}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[v.status] ?? "bg-gray-100 text-gray-800"}`}
                        >
                          {v.status}
                        </span>
                      </div>
                      <p className="truncate text-xs text-gray-500">
                        {Object.keys(v.transforms ?? {}).join(", ") || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Distribution Scheduler */}
        {selectedSourceId && doneVariations.length > 0 && (
          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Schedule Distribution</h2>

            {/* Variation selection */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-gray-700">Variations</h3>
              <div className="flex flex-wrap gap-2">
                {doneVariations.map((v: any) => (
                  <label key={v.id} className="flex items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedVariationIds.has(v.id)}
                      onChange={() => toggleVariation(v.id)}
                      className="rounded border-gray-300"
                    />
                    #{v.variationIndex}
                  </label>
                ))}
              </div>
            </div>

            {/* Account selection */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-gray-700">Accounts</h3>
              <div className="flex flex-wrap gap-2">
                {(accounts.data ?? []).map((a: any) => (
                  <label key={a.id} className="flex items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedAccountIds.has(a.id)}
                      onChange={() => toggleAccount(a.id)}
                      className="rounded border-gray-300"
                    />
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${PLATFORM_COLORS[a.platform] ?? "bg-gray-100 text-gray-800"}`}>
                      {a.platform}
                    </span>
                    {a.accountLabel}
                  </label>
                ))}
              </div>
            </div>

            {/* Scheduling controls */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                Stagger (min)
                <input
                  type="number"
                  min={1}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value)))}
                  className="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                Start
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                />
              </label>
              <button
                onClick={() =>
                  scheduleDistribution.mutate({
                    variationIds: [...selectedVariationIds],
                    accountIds: [...selectedAccountIds],
                    startAt: new Date(startAt),
                    intervalMinutes,
                  })
                }
                disabled={
                  selectedVariationIds.size === 0 ||
                  selectedAccountIds.size === 0 ||
                  !startAt ||
                  scheduleDistribution.isPending
                }
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {scheduleDistribution.isPending ? "Scheduling..." : "Schedule"}
              </button>
            </div>
            {scheduleDistribution.error && (
              <p className="text-sm text-red-600">{scheduleDistribution.error.message}</p>
            )}
          </div>
        )}

        {/* Distribution Timeline */}
        {distributionStatus.data && distributionStatus.data.length > 0 && (
          <div className="mt-8 rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Distribution Timeline</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {distributionStatus.data.map((post: any) => (
                <li key={post.id} className="flex items-center gap-4 px-6 py-3">
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(post.scheduledAt).toLocaleString()}
                  </span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[post.account?.platform] ?? "bg-gray-100 text-gray-800"}`}>
                    {post.account?.platform}
                  </span>
                  <span className="text-sm text-gray-700">{post.account?.accountLabel}</span>
                  <span className="text-xs text-gray-500">Var #{post.variation?.variationIndex}</span>
                  <span className={`ml-auto inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[post.status] ?? "bg-gray-100 text-gray-800"}`}>
                    {post.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
