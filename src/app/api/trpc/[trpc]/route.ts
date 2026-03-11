import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

function handler(req: NextRequest) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext(),
    onError({ path, error }) {
      console.error(
        `tRPC error on ${path ?? "<no-path>"}:`,
        error.code,
        error.message,
      );
    },
  });
}

export { handler as GET, handler as POST };
