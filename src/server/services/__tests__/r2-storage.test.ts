import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: class {
      send = sendMock;
    },
    PutObjectCommand: class { constructor(public input: unknown) {} },
    GetObjectCommand: class { constructor(public input: unknown) {} },
    DeleteObjectCommand: class { constructor(public input: unknown) {} },
    HeadObjectCommand: class { constructor(public input: unknown) {} },
    ListObjectsV2Command: class { constructor(public input: unknown) {} },
    CopyObjectCommand: class { constructor(public input: unknown) {} },
  };
});

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    constructor(public params: unknown) {}
    async done() { return {}; }
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://signed-url.example.com"),
}));

import {
  uploadFile,
  downloadFile,
  deleteFile,
  getSignedUrl,
  fileExists,
  listFiles,
  copyFile,
  getUploadSignedUrl,
} from "../r2-storage";

describe("r2-storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("uploadFile", () => {
    it("uploads buffer and returns URL", async () => {
      sendMock.mockResolvedValue({});
      const url = await uploadFile("test/file.mp4", Buffer.from("data"), "video/mp4");
      expect(url).toContain("test/file.mp4");
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("downloadFile", () => {
    it("downloads and returns buffer", async () => {
      sendMock.mockResolvedValue({
        Body: {
          async *[Symbol.asyncIterator]() {
            yield Buffer.from("chunk1");
            yield Buffer.from("chunk2");
          },
        },
      });
      const result = await downloadFile("test/file.mp4");
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe("chunk1chunk2");
    });

    it("throws on empty body", async () => {
      sendMock.mockResolvedValue({ Body: null });
      await expect(downloadFile("test/file.mp4")).rejects.toThrow("Empty response");
    });
  });

  describe("deleteFile", () => {
    it("sends delete command", async () => {
      sendMock.mockResolvedValue({});
      await deleteFile("test/file.mp4");
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("getSignedUrl", () => {
    it("returns signed URL", async () => {
      const url = await getSignedUrl("test/file.mp4");
      expect(url).toBe("https://signed-url.example.com");
    });
  });

  describe("fileExists", () => {
    it("returns metadata when file exists", async () => {
      sendMock.mockResolvedValue({ ContentLength: 1024, ContentType: "video/mp4" });
      const result = await fileExists("test/file.mp4");
      expect(result).toEqual({ contentLength: 1024, contentType: "video/mp4" });
    });

    it("returns null when file not found", async () => {
      const err = new Error("Not found");
      err.name = "NotFound";
      sendMock.mockRejectedValue(err);
      const result = await fileExists("test/missing.mp4");
      expect(result).toBeNull();
    });

    it("rethrows other errors", async () => {
      sendMock.mockRejectedValue(new Error("Network error"));
      await expect(fileExists("test/file.mp4")).rejects.toThrow("Network error");
    });
  });

  describe("listFiles", () => {
    it("returns list of files", async () => {
      sendMock.mockResolvedValue({
        Contents: [
          { Key: "test/a.mp4", Size: 100, LastModified: new Date("2026-01-01") },
          { Key: "test/b.mp4", Size: 200, LastModified: new Date("2026-01-02") },
        ],
        IsTruncated: false,
      });
      const result = await listFiles("test/");
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe("test/a.mp4");
      expect(result[0].size).toBe(100);
    });

    it("returns empty array when no contents", async () => {
      sendMock.mockResolvedValue({ Contents: undefined, IsTruncated: false });
      const result = await listFiles("test/");
      expect(result).toEqual([]);
    });
  });

  describe("copyFile", () => {
    it("sends copy command", async () => {
      sendMock.mockResolvedValue({});
      await copyFile("source.mp4", "dest.mp4");
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("getUploadSignedUrl", () => {
    it("returns upload signed URL", async () => {
      const url = await getUploadSignedUrl("test/upload.mp4", "video/mp4");
      expect(url).toBe("https://signed-url.example.com");
    });
  });
});
