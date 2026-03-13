import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? "silent" : isProduction ? "info" : "debug"),
  ...(isProduction
    ? {
        formatters: {
          level: (label: string) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : isTest
      ? { level: "silent" }
      : {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
        }),
});

export const workerLogger = logger.child({ component: "worker" });
export const workflowLogger = logger.child({ component: "workflow" });
export const agentLogger = logger.child({ component: "agent" });
export const apiLogger = logger.child({ component: "api" });
