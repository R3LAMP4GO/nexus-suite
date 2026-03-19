"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { api } from "@/lib/trpc-client";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";

/* ── Schema ─────────────────────────────────────────────────── */

const onboardingSchema = z.object({
  niche: z.string().min(2, "Tell us your content niche").max(200),
  brandVoice: z.string().max(2000).optional(),
  tonePreferences: z.string().max(1000).optional(),
  competitorUrls: z.string().optional(),
  platforms: z
    .array(z.enum(["YOUTUBE", "TIKTOK", "INSTAGRAM", "LINKEDIN", "X", "FACEBOOK"]))
    .min(1, "Select at least one platform"),
  postingFrequency: z.string().optional(),
  contentStyle: z.string().optional(),
  additionalNotes: z.string().max(2000).optional(),
});

type FormData = z.infer<typeof onboardingSchema>;

const STEPS = ["Niche & Brand", "Competitors", "Platforms & Style", "Review"] as const;

const PLATFORM_OPTIONS = [
  { value: "YOUTUBE", label: "YouTube" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "X", label: "X (Twitter)" },
  { value: "FACEBOOK", label: "Facebook" },
] as const;

const INPUT_CLASS =
  "w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-2.5 text-[var(--input-text)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const router = useRouter();

  const { data: existing, isLoading: existingLoading } =
    api.onboarding.get.useQuery();
  const submit = api.onboarding.submit.useMutation({
    onSuccess: () => router.push("/provisioning"),
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      niche: "",
      brandVoice: "",
      tonePreferences: "",
      competitorUrls: "",
      platforms: [],
      postingFrequency: "",
      contentStyle: "",
      additionalNotes: "",
    },
  });

  useEffect(() => {
    if (existing) {
      reset({
        niche: existing.niche ?? "",
        brandVoice: existing.brandVoice ?? "",
        tonePreferences: existing.tonePreferences ?? "",
        competitorUrls:
          (existing.competitorUrls as string[] | undefined)?.join("\n") ?? "",
        platforms:
          ((existing.platforms as string[] | undefined) as FormData["platforms"]) ?? [],
        postingFrequency: existing.postingFrequency ?? "",
        contentStyle: existing.contentStyle ?? "",
        additionalNotes: existing.additionalNotes ?? "",
      });
    }
  }, [existing, reset]);

  // eslint-disable-next-line react-hooks/incompatible-library -- expected react-hook-form usage
  const selectedPlatforms = watch("platforms") ?? [];

  async function nextStep() {
    const fieldsPerStep: (keyof FormData)[][] = [
      ["niche", "brandVoice", "tonePreferences"],
      ["competitorUrls"],
      ["platforms", "postingFrequency", "contentStyle"],
      [],
    ];
    const valid = await trigger(fieldsPerStep[step]);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function togglePlatform(platform: FormData["platforms"][number]) {
    const current = selectedPlatforms;
    const next = current.includes(platform)
      ? current.filter((p) => p !== platform)
      : [...current, platform];
    setValue("platforms", next, { shouldValidate: true });
  }

  function onSubmit(data: FormData) {
    const competitorUrls = (data.competitorUrls ?? "")
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    submit.mutate({
      niche: data.niche,
      brandVoice: data.brandVoice,
      tonePreferences: data.tonePreferences,
      competitorUrls,
      platforms: data.platforms,
      postingFrequency: data.postingFrequency,
      contentStyle: data.contentStyle,
      additionalNotes: data.additionalNotes,
    });
  }

  if (existingLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] p-8 shadow-lg">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="mb-2 flex justify-between text-sm text-[var(--text-muted)]">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={
                  i <= step
                    ? "font-medium text-[var(--text-primary)]"
                    : ""
                }
              >
                {label}
              </span>
            ))}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Step 1 */}
          {step === 0 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Tell us about your brand
              </h2>
              <FormField label="Content Niche" required error={errors.niche?.message}>
                <input
                  {...register("niche")}
                  placeholder="e.g., Tech reviews, Fitness coaching..."
                  className={INPUT_CLASS}
                />
              </FormField>
              <FormField label="Brand Voice">
                <textarea
                  {...register("brandVoice")}
                  rows={3}
                  placeholder="Professional, casual, humorous..."
                  className={INPUT_CLASS}
                />
              </FormField>
              <FormField label="Tone Preferences">
                <input
                  {...register("tonePreferences")}
                  placeholder="Friendly but expert, No slang..."
                  className={INPUT_CLASS}
                />
              </FormField>
            </div>
          )}

          {/* Step 2 */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Who are your competitors?
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Paste profile URLs of creators you want to track. One per line.
              </p>
              <FormField label="Competitor Profile URLs">
                <textarea
                  {...register("competitorUrls")}
                  rows={6}
                  placeholder={"https://youtube.com/@competitor1\nhttps://tiktok.com/@competitor2"}
                  className={`${INPUT_CLASS} font-mono text-sm`}
                />
              </FormField>
            </div>
          )}

          {/* Step 3 */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Platforms & content style
              </h2>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                  Target Platforms *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORM_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => togglePlatform(opt.value)}
                      className={`rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition ${
                        selectedPlatforms.includes(opt.value)
                          ? "border-[var(--accent)] bg-blue-50 dark:bg-blue-900/20 text-[var(--accent)]"
                          : "border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {errors.platforms && (
                  <p className="mt-1 text-sm text-[var(--danger)]">
                    {errors.platforms.message}
                  </p>
                )}
              </div>
              <FormField label="Posting Frequency">
                <select {...register("postingFrequency")} className={INPUT_CLASS}>
                  <option value="">Select frequency...</option>
                  <option value="daily">Daily</option>
                  <option value="3x/week">3x per week</option>
                  <option value="weekly">Weekly</option>
                  <option value="custom">Custom</option>
                </select>
              </FormField>
              <FormField label="Content Style">
                <select {...register("contentStyle")} className={INPUT_CLASS}>
                  <option value="">Select style...</option>
                  <option value="educational">Educational / How-to</option>
                  <option value="entertainment">Entertainment / Viral</option>
                  <option value="thought-leadership">Thought Leadership</option>
                  <option value="product-showcase">Product Showcase</option>
                  <option value="mixed">Mixed</option>
                </select>
              </FormField>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Review & submit
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                After submitting, our team will configure your AI agents. This typically takes 24-48 hours.
              </p>
              <div className="mx-auto max-w-md space-y-3 rounded-lg bg-[var(--bg-tertiary)] p-4 text-sm">
                <Row label="Niche" value={watch("niche")} />
                <Row label="Brand Voice" value={watch("brandVoice") || "—"} />
                <Row label="Tone" value={watch("tonePreferences") || "—"} />
                <Row
                  label="Competitors"
                  value={
                    (watch("competitorUrls") ?? "").split("\n").filter(Boolean)
                      .length + " URLs"
                  }
                />
                <Row label="Platforms" value={selectedPlatforms.join(", ") || "—"} />
                <Row label="Frequency" value={watch("postingFrequency") || "—"} />
                <Row label="Style" value={watch("contentStyle") || "—"} />
              </div>
              <FormField label="Additional Notes">
                <textarea
                  {...register("additionalNotes")}
                  rows={3}
                  placeholder="Anything else we should know..."
                  className={INPUT_CLASS}
                />
              </FormField>
              {submit.error && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
                  {submit.error.message}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={prevStep}
              disabled={step === 0}
              className={step === 0 ? "invisible" : ""}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={nextStep}>
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                loading={submit.isPending}
                loadingText="Submitting..."
                className="bg-[var(--success)] hover:opacity-90"
              >
                Submit & Start Setup
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="font-medium text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
