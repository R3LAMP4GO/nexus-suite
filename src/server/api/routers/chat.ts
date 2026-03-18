import { z } from "zod";
import { createTRPCRouter, onboardedProcedure } from "../trpc";

export const chatRouter = createTRPCRouter({
  listConversations: onboardedProcedure.query(async ({ ctx }) => {
    const conversations = await ctx.db.chatConversation.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { updatedAt: "desc" },
      include: { messages: { take: 1, orderBy: { createdAt: "desc" } } },
    });
    return { conversations };
  }),

  getConversation: onboardedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const conv = await ctx.db.chatConversation.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return conv;
    }),

  createConversation: onboardedProcedure.mutation(async ({ ctx }) => {
    const conv = await ctx.db.chatConversation.create({
      data: {
        organizationId: ctx.organizationId,
        title: "New Conversation",
      },
    });
    return conv;
  }),

  deleteConversation: onboardedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.chatConversation.delete({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
      return { success: true };
    }),

  sendMessage: onboardedProcedure
    .input(z.object({ conversationId: z.string(), content: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const msg = await ctx.db.chatMessage.create({
        data: {
          conversationId: input.conversationId,
          role: "user",
          type: "text",
          content: input.content,
        },
      });
      return msg;
    }),

  addAssistantMessage: onboardedProcedure
    .input(z.object({ conversationId: z.string(), content: z.string(), type: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const msg = await ctx.db.chatMessage.create({
        data: {
          conversationId: input.conversationId,
          role: "assistant",
          type: input.type ?? "text",
          content: input.content,
        },
      });
      return msg;
    }),

  invokeOrchestrator: onboardedProcedure
    .input(z.object({ conversationId: z.string(), messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Stub: In production this would enqueue an agent job
      return {
        jobId: `job_${input.messageId}`,
        assistantMessageId: `amsg_${input.messageId}`,
      };
    }),

  getJobStatus: onboardedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Stub: In production this would check pg-boss job status
      return {
        jobId: input.jobId,
        state: "completed" as string,
        output: null as Record<string, unknown> | null,
      };
    }),
});
