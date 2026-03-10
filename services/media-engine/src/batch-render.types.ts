// Types for the BatchEdit-style combinatorial render pipeline.
// Ported from R3LAMP4GO/batchedit Electron app → server-side Node.js service.

export interface RenderJob {
  id: string;
  hookPath: string;
  meatPath: string;
  ctaPath: string;
  outputPath: string;
  textOverlay?: string;
  hookDurationSec?: number;
  captionsAssPath?: string;
  autoResize?: boolean;
  resolution: { width: number; height: number };
}

export interface RenderProgress {
  jobId: string;
  percent: number;
  status: "queued" | "rendering" | "done" | "error";
  error?: string;
}

export interface CaptionStyle {
  id: string;
  label: string;
  fontName: string;
  fontFile: string;
  highlightColor: string;
}

export interface WordChunk {
  text: string;
  start: number;
  end: number;
}

export interface CaptionSegment {
  wordChunks: WordChunk[];
  offsetMs: number;
}

export interface BatchRenderRequest {
  hookClips: string[];  // R2 keys
  meatClips: string[];
  ctaClips: string[];
  organizationId: string;
  resolution: { width: number; height: number };
  autoCaptions: boolean;
  autoResize: boolean;
  captionStyle?: CaptionStyle;
}
