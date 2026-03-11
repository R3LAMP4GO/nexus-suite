"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";

type UploadState = "idle" | "selected" | "uploading" | "success" | "error";

export default function UploadPage() {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [scriptId, setScriptId] = useState<string>("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const [platform, setPlatform] = useState<string>("TIKTOK");
  const [uploadProgress, setUploadProgress] = useState(0);

  const scripts = api.scripts.list.useQuery({ status: "APPROVED" });
  const presignMutation = api.upload.getPresignedUploadUrl.useMutation();
  const uploadMutation = api.upload.uploadAndMultiply.useMutation({
    onSuccess: () => setUploadState("success"),
    onError: (err) => {
      setUploadState("error");
      setErrorMessage(err.message);
    },
  });

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("video/")) return;
    setFile(f);
    setUploadState("selected");
    setErrorMessage("");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleUpload = async () => {
    if (!file) return;
    setUploadState("uploading");
    setUploadProgress(0);

    try {
      // 1. Get presigned URL from backend
      setUploadProgress(10);
      const { url: presignedUrl, key } = await presignMutation.mutateAsync({
        filename: file.name,
        contentType: file.type,
      });

      // 2. Upload file directly to R2 via presigned URL
      setUploadProgress(20);
      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.statusText}`);
      }

      // 3. Tell backend to create variations from the uploaded file
      setUploadProgress(80);
      uploadMutation.mutate({
        url: key,
        platform: platform as "TIKTOK" | "YOUTUBE" | "INSTAGRAM" | "LINKEDIN" | "X" | "FACEBOOK",
        scriptId: scriptId || undefined,
      });
    } catch (err) {
      setUploadState("error");
      setErrorMessage(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const reset = () => {
    setFile(null);
    setScriptId("");
    setUploadState("idle");
    setErrorMessage("");
  };

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Upload Your Video
          </h1>
          <p className="mt-2 text-lg text-[var(--text-muted)]">
            Drop your video and we&apos;ll handle the rest
          </p>
        </div>

        {uploadState === "success" ? (
          <div className="rounded-xl border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <svg
                className="h-8 w-8 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-green-900 dark:text-green-100">
              Your video is being processed!
            </h3>
            <p className="mt-2 text-green-700 dark:text-green-300">
              We&apos;re creating 5 unique variations automatically.
            </p>
            <Button onClick={reset} className="mt-6">
              Upload Another
            </Button>
          </div>
        ) : (
          <>
            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`relative min-h-[300px] rounded-xl border-2 border-dashed transition-all ${
                dragOver
                  ? "border-[var(--accent)] bg-blue-50 dark:bg-blue-900/20"
                  : file
                    ? "border-[var(--accent)] bg-blue-50/50 dark:bg-blue-900/10"
                    : "border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--border-hover)]"
              } flex flex-col items-center justify-center p-12`}
            >
              {file ? (
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                    <svg
                      className="h-7 w-7 text-indigo-600 dark:text-indigo-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-lg font-medium text-[var(--text-primary)]">
                    {file.name}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      reset();
                    }}
                    className="mt-3 text-sm text-[var(--danger)] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <svg
                    className="mb-4 h-16 w-16 text-[var(--text-muted)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="text-lg font-medium text-[var(--text-secondary)]">
                    Drag &amp; drop your video here
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">or</p>
                  <label className="mt-3 cursor-pointer rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]">
                    Browse Files
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                    />
                  </label>
                </>
              )}
            </div>

            {/* Platform */}
            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                Target Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-2.5 text-sm text-[var(--input-text)] shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              >
                <option value="TIKTOK">TikTok</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="LINKEDIN">LinkedIn</option>
                <option value="X">X (Twitter)</option>
                <option value="FACEBOOK">Facebook</option>
              </select>
            </div>

            {/* Link to Script */}
            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                Link to Script (optional)
              </label>
              <select
                value={scriptId}
                onChange={(e) => setScriptId(e.target.value)}
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-2.5 text-sm text-[var(--input-text)] shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              >
                <option value="">No script linked</option>
                {scripts.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Error */}
            {uploadState === "error" && (
              <div className="mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-400">
                {errorMessage || "Something went wrong. Please try again."}
              </div>
            )}

            {/* Upload Button */}
            {file && (
              <Button
                onClick={handleUpload}
                loading={uploadState === "uploading"}
                loadingText="Creating your magic variations…"
                size="lg"
                className="mt-6 w-full"
              >
                Upload &amp; Create Variations
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
