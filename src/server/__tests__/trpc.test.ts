import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";

describe("tRPC Middleware", () => {
  describe("publicProcedure", () => {
    it("должен позволять доступ без авторизации", async () => {
      const t = initTRPC.context<any>().create({ transformer: superjson });
      
      const publicProcedure = t.procedure;
      const router = t.router;
      
      const testRouter = router({
        hello: publicProcedure.query(({ ctx }) => {
          return { message: "Hello", session: ctx.session };
        }),
      });
      
      const caller = testRouter.createCaller({
        session: null,
        db: {},
        headers: new Headers(),
      });
      
      const result = await caller.hello();
      expect(result.message).toBe("Hello");
      expect(result.session).toBeNull();
    });
  });

  describe("protectedProcedure", () => {
    it("должен отклонять запрос без сессии", async () => {
      const t = initTRPC.context<any>().create({ transformer: superjson });
      
      const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
        if (!ctx.session) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }
        return next({ ctx: { ...ctx, user: ctx.session.user } });
      });
      
      const router = t.router;
      
      const testRouter = router({
        secret: protectedProcedure.query(({ ctx }) => {
          return { userId: ctx.user.id };
        }),
      });
      
      const caller = testRouter.createCaller({
        session: null,
        db: {},
        headers: new Headers(),
      });
      
      await expect(caller.secret()).rejects.toThrow(TRPCError);
    });

    it("должен позволять доступ с валидной сессией", async () => {
      const t = initTRPC.context<any>().create({ transformer: superjson });
      
      const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
        if (!ctx.session) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }
        return next({ ctx: { ...ctx, user: ctx.session.user } });
      });
      
      const router = t.router;
      
      const testRouter = router({
        secret: protectedProcedure.query(({ ctx }) => {
          return { userId: ctx.user.id, email: ctx.user.email };
        }),
      });
      
      const mockSession = {
        user: { id: "user-1", email: "test@test.com", name: "Test" },
        session: { id: "session-1", expiresAt: new Date() },
      };
      
      const caller = testRouter.createCaller({
        session: mockSession,
        db: {},
        headers: new Headers(),
      });
      
      const result = await caller.secret();
      expect(result.userId).toBe("user-1");
      expect(result.email).toBe("test@test.com");
    });
  });

  describe("Input Validation", () => {
    it("должен отклонять невалидный email", async () => {
      const t = initTRPC.context<any>().create({ transformer: superjson });
      const { z } = await import("zod");
      
      const procedure = t.procedure.input(z.object({
        email: z.string().email(),
      }));
      
      const router = t.router;
      
      const testRouter = router({
        test: procedure.query(({ input }) => input.email),
      });
      
      const caller = testRouter.createCaller({});
      
      await expect(caller.test({ email: "invalid" })).rejects.toThrow();
    });

    it("должен принимать валидный email", async () => {
      const t = initTRPC.context<any>().create({ transformer: superjson });
      const { z } = await import("zod");
      
      const procedure = t.procedure.input(z.object({
        email: z.string().email(),
      }));
      
      const router = t.router;
      
      const testRouter = router({
        test: procedure.query(({ input }) => input.email),
      });
      
      const caller = testRouter.createCaller({});
      
      const result = await caller.test({ email: "test@test.com" });
      expect(result).toBe("test@test.com");
    });

    it("должен валидировать длину строки", async () => {
      const t = initTRPC.context<any>().create({ transformer: superjson });
      const { z } = await import("zod");
      
      const procedure = t.procedure.input(z.object({
        roomId: z.string().length(6),
      }));
      
      const router = t.router;
      
      const testRouter = router({
        test: procedure.query(({ input }) => input.roomId),
      });
      
      const caller = testRouter.createCaller({});
      
      await expect(caller.test({ roomId: "123" })).rejects.toThrow();
      await expect(caller.test({ roomId: "1234567" })).rejects.toThrow();
      
      const result = await caller.test({ roomId: "ABC123" });
      expect(result).toBe("ABC123");
    });

    it("должен валидировать диапазон чисел", async () => {
      const t = initTRPC.context<any>().create({ transformer: superjson });
      const { z } = await import("zod");
      
      const procedure = t.procedure.input(z.object({
        maxPlayers: z.number().min(2).max(6),
      }));
      
      const router = t.router;
      
      const testRouter = router({
        test: procedure.query(({ input }) => input.maxPlayers),
      });
      
      const caller = testRouter.createCaller({});
      
      await expect(caller.test({ maxPlayers: 1 })).rejects.toThrow();
      await expect(caller.test({ maxPlayers: 7 })).rejects.toThrow();
      
      const result = await caller.test({ maxPlayers: 4 });
      expect(result).toBe(4);
    });
  });
});
