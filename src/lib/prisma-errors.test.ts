import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { handlePrismaError } from "./prisma-errors";

describe("handlePrismaError", () => {
  it("maps P2002 (unique constraint) to CONFLICT", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.0.0",
      meta: { target: ["email"] },
    });
    const result = handlePrismaError(error);
    expect(result).toBeInstanceOf(TRPCError);
    expect(result.code).toBe("CONFLICT");
    expect(result.message).toContain("email");
  });

  it("maps P2025 (record not found) to NOT_FOUND", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "5.0.0",
    });
    const result = handlePrismaError(error);
    expect(result.code).toBe("NOT_FOUND");
  });

  it("maps P2003 (foreign key) to BAD_REQUEST", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
      code: "P2003",
      clientVersion: "5.0.0",
      meta: { field_name: "organizationId" },
    });
    const result = handlePrismaError(error);
    expect(result.code).toBe("BAD_REQUEST");
    expect(result.message).toContain("organizationId");
  });

  it("maps P2018 (required record not found) to NOT_FOUND", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Required record not found", {
      code: "P2018",
      clientVersion: "5.0.0",
    });
    const result = handlePrismaError(error);
    expect(result.code).toBe("NOT_FOUND");
  });

  it("maps unknown Prisma error code to INTERNAL_SERVER_ERROR", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unknown", {
      code: "P9999",
      clientVersion: "5.0.0",
    });
    const result = handlePrismaError(error);
    expect(result.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("maps PrismaClientValidationError to BAD_REQUEST", () => {
    const error = new Prisma.PrismaClientValidationError("Validation failed", {
      clientVersion: "5.0.0",
    });
    const result = handlePrismaError(error);
    expect(result.code).toBe("BAD_REQUEST");
    expect(result.message).toBe("Invalid data provided.");
  });

  it("maps unknown error to INTERNAL_SERVER_ERROR", () => {
    const result = handlePrismaError(new Error("random error"));
    expect(result.code).toBe("INTERNAL_SERVER_ERROR");
    expect(result.message).toBe("An unexpected error occurred.");
  });

  it("handles P2002 with no meta target gracefully", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "5.0.0",
    });
    const result = handlePrismaError(error);
    expect(result.code).toBe("CONFLICT");
    expect(result.message).toContain("field");
  });
});
