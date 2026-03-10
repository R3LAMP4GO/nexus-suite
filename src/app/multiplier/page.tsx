"use client";

import { useState } from "react";
import { api } from "@/lib/trpc-client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SourceTab, type SourceVideo } from "./_components/source-tab";
import { GenerateTab } from "./_components/generate-tab";
import { ScheduleTab } from "./_components/schedule-tab";
import { TimelineTab } from "./_components/timeline-tab";

export default function MultiplierPage() {
  const [sources, setSources] = useState<SourceVideo[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const uploadSource = api.multiplier.uploadSource.useMutation({
    onSuccess: (data) => {
      const src = data as unknown as SourceVideo;
      setSources((prev) => [src, ...prev]);
      setSelectedSourceId(src.id);
    },
  });

  const generateVariations = api.multiplier.generateVariations.useMutation({
    onSuccess: () => void variations.refetch(),
  });

  const variations = api.multiplier.getVariations.useQuery(
    { sourceVideoId: selectedSourceId! },
    { enabled: !!selectedSourceId, refetchInterval: 5000 },
  );

  const accounts = api.settings.listPlatformTokens.useQuery();

  const scheduleDistribution = api.multiplier.scheduleDistribution.useMutation({
    onSuccess: () => void distributionStatus.refetch(),
  });

  const distributionStatus = api.multiplier.getDistributionStatus.useQuery(
    { sourceVideoId: selectedSourceId ?? undefined },
    { enabled: !!selectedSourceId, refetchInterval: 10000 },
  );

  const doneVariations = (variations.data ?? []).filter(
    (v: any) => v.status === "DONE",
  );

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Multiplier
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Upload source videos, generate variations, schedule distribution
          </p>
        </div>

        <Tabs defaultValue="source">
          <TabsList>
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="source">
            <SourceTab
              sources={sources}
              selectedSourceId={selectedSourceId}
              onSelectSource={setSelectedSourceId}
              uploadSource={uploadSource}
            />
          </TabsContent>

          <TabsContent value="generate">
            <GenerateTab
              selectedSourceId={selectedSourceId}
              generateVariations={generateVariations}
              variations={variations}
            />
          </TabsContent>

          <TabsContent value="schedule">
            <ScheduleTab
              selectedSourceId={selectedSourceId}
              doneVariations={doneVariations}
              accounts={accounts}
              scheduleDistribution={scheduleDistribution}
            />
          </TabsContent>

          <TabsContent value="timeline">
            <TimelineTab
              selectedSourceId={selectedSourceId}
              distributionStatus={distributionStatus}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
