import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

import {
  sendScriptReadyEmail,
  sendVideoProcessedEmail,
  sendActivationEmail,
  sendWelcomeEmail,
} from "./notifications";

describe("notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test_key";
  });

  describe("sendScriptReadyEmail", () => {
    it("sends email with correct subject and recipient", async () => {
      mockSend.mockResolvedValue({ data: { id: "msg_123" }, error: null });
      const result = await sendScriptReadyEmail("user@test.com", "My Script");
      expect(result.success).toBe(true);
      expect(result.messageId).toBe("msg_123");
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@test.com",
          subject: expect.stringContaining("My Script"),
        }),
      );
    });

    it("returns error when Resend returns error", async () => {
      mockSend.mockResolvedValue({ data: null, error: { message: "Invalid API key" } });
      const result = await sendScriptReadyEmail("user@test.com", "Script");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid API key");
    });

    it("handles thrown exceptions", async () => {
      mockSend.mockRejectedValue(new Error("Network error"));
      const result = await sendScriptReadyEmail("user@test.com", "Script");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("escapes HTML in script title", async () => {
      mockSend.mockResolvedValue({ data: { id: "msg_123" }, error: null });
      await sendScriptReadyEmail("user@test.com", '<script>alert("xss")</script>');
      const html = mockSend.mock.calls[0][0].html;
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("sendVideoProcessedEmail", () => {
    it("sends email with variation count", async () => {
      mockSend.mockResolvedValue({ data: { id: "msg_456" }, error: null });
      const result = await sendVideoProcessedEmail("user@test.com", 5);
      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("5"),
        }),
      );
    });
  });

  describe("sendActivationEmail", () => {
    it("sends activation email with org name", async () => {
      mockSend.mockResolvedValue({ data: { id: "msg_789" }, error: null });
      const result = await sendActivationEmail("user@test.com", "My Org");
      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("My Org"),
        }),
      );
    });
  });

  describe("sendWelcomeEmail", () => {
    it("sends welcome email with onboarding link", async () => {
      mockSend.mockResolvedValue({ data: { id: "msg_012" }, error: null });
      const result = await sendWelcomeEmail("user@test.com", "New Org");
      expect(result.success).toBe(true);
      const html = mockSend.mock.calls[0][0].html;
      expect(html).toContain("onboarding");
    });
  });
});
