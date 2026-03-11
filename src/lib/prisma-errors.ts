import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";

/**
 * Maps known Prisma client errors to appropriate TRPCError codes.
 * Throws the mapped TRPCError; re-throws unknown errors as INTERNAL_SERVER_ERROR.
 *
 * Usage in tRPC routers:
 *   try { await ctx.db.foo.create(...) } catch (e) { throw handlePrismaError(e) }
 */
export function handlePrismaError(error: unknown): TRPCError {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      // Unique constraint violation
      case "P2002": {
        const target = (error.meta?.target as string[])?.join(", ") ?? "field";
        return new TRPCError({
          code: "CONFLICT",
          message: `A record with this ${target} already exists.`,
          cause: error,
        });
      }

      // Record not found (for update/delete operations)
      case "P2025":
        return new TRPCError({
          code: "NOT_FOUND",
          message: "The requested record was not found.",
          cause: error,
        });

      // Foreign key constraint violation
      case "P2003": {
        const field = (error.meta?.field_name as string) ?? "relation";
        return new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid reference: related ${field} does not exist.`,
          cause: error,
        });
      }

      // Required record not found (for connect operations)
      case "P2018":
        return new TRPCError({
          code: "NOT_FOUND",
          message: "A required related record was not found.",
          cause: error,
        });

      default:
        return new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "A database error occurred.",
          cause: error,
        });
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid data provided.",
      cause: error,
    });
  }

  // Unknown error
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
    cause: error,
  });
}
