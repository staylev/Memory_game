import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

const handler = async (req: Request) => {
  // Создаём копию заголовков
  const headers = new Headers(req.headers);
  
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      // Используем заголовки из запроса напрямую
      const session = await auth.api.getSession({ headers });
      return {
        db,
        session,
        headers,
      };
    },
  });
};

export { handler as GET, handler as POST };