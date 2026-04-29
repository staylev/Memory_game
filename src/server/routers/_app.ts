import { router } from "@/server/trpc";
import { gameRouter } from "./game";

// Объединяем все роутеры в один корневой
export const appRouter = router({
  game: gameRouter,
});

// Экспортируем тип для клиента (type inference)
export type AppRouter = typeof appRouter;