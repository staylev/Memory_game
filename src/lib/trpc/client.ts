import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers/_app";

// Создаем типизированный хук для React
export const trpc = createTRPCReact<AppRouter>();