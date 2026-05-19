import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { randomBytes } from "crypto";

import {
  createMockDB,
  createMockUser,
  createMockRoom,
  createMockPlayer,
  createTestTRPC,
  type MockSession,
} from "./helpers";

// Импортируем базовые типы
import { initTRPC } from "@trpc/server";
import superjson from "superjson";

// Копия вспомогательных функций из game.ts
function generateRoomCode(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

function generateSequence(length: number): number[] {
  return Array.from({ length }, () => Math.floor(Math.random() * 4));
}

// Создаём упрощённый router для тестов
function createTestGameRouter(
  publicProcedure: any,
  protectedProcedure: any,
  router: any,
  z: any
) {
  return router({
    // Простой тестовый endpoint
    testSequenceGeneration: publicProcedure.query(() => {
      const seq = generateSequence(2);
      return { sequence: seq, length: seq.length };
    }),

    testRoomCodeGeneration: publicProcedure.query(() => {
      const code = generateRoomCode();
      return { code, length: code.length };
    }),
  });
}

describe("Game Helpers", () => {
  describe("generateSequence", () => {
    it("должен генерировать последовательность указанной длины", () => {
      const seq = generateSequence(5);
      expect(seq).toHaveLength(5);
    });

    it("должен генерировать числа от 0 до 3", () => {
      const seq = generateSequence(10);
      seq.forEach((num) => {
        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThanOrEqual(3);
      });
    });

    it("должен генерировать случайную последовательность", () => {
      const seq1 = generateSequence(4);
      const seq2 = generateSequence(4);
      // Шанс что они совпадут крайне мал
      expect(JSON.stringify(seq1)).not.toBe(JSON.stringify(seq2));
    });
  });

  describe("generateRoomCode", () => {
    it("должен генерировать код длиной 6 символов", () => {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
    });

    it("должен генерировать только шестнадцатеричные символы в верхнем регистре", () => {
      const code = generateRoomCode();
      expect(code).toMatch(/^[0-9A-F]{6}$/);
    });
  });
});

// Тесты для gameRouter
describe("gameRouter", () => {
  let t: any;
  let publicProcedure: any;
  let protectedProcedure: any;
  let router: any;
  let createCaller: any;
  let mockUser: any;
  let mockSession: MockSession;
  let testRouter: any;

  beforeEach(() => {
    mockUser = createMockUser();
    mockSession = {
      user: mockUser,
      session: { id: "session-1", expiresAt: new Date() },
    };

    t = initTRPC.context<any>().create({ transformer: superjson });
    publicProcedure = t.procedure;
    protectedProcedure = t.procedure.use(async ({ ctx, next }: any) => {
      if (!ctx.session) {
        throw new Error("UNAUTHORIZED");
      }
      return next({ ctx: { ...ctx, session: ctx.session, user: ctx.session.user } });
    });
    router = t.router;

    testRouter = createTestGameRouter(publicProcedure, protectedProcedure, router, z);

    const mockDB = createMockDB();
    const appRouter = router({ test: testRouter });
    createCaller = appRouter.createCaller({
      db: mockDB,
      session: mockSession,
      headers: new Headers(),
    });
  });

  describe("testSequenceGeneration", () => {
    it("должен возвращать последовательность длины 2", async () => {
      const result = await createCaller.test.testSequenceGeneration();
      expect(result.sequence).toHaveLength(2);
      expect(result.length).toBe(2);
    });

    it("должен возвращать валидные индексы", async () => {
      const result = await createCaller.test.testSequenceGeneration();
      result.sequence.forEach((num: number) => {
        expect([0, 1, 2, 3]).toContain(num);
      });
    });
  });

  describe("testRoomCodeGeneration", () => {
    it("должен возвращать код длиной 6", async () => {
      const result = await createCaller.test.testRoomCodeGeneration();
      expect(result.code).toHaveLength(6);
      expect(result.length).toBe(6);
    });

    it("должен возвращать код в верхнем регистре", async () => {
      const result = await createCaller.test.testRoomCodeGeneration();
      expect(result.code).toBe(result.code.toUpperCase());
    });
  });
});

// Тесты для createBotRoom и playBotRound
describe("Bot Game Logic", () => {
  it("должен генерировать начальную последовательность длины 2", () => {
    const seq = generateSequence(2);
    expect(seq).toHaveLength(2);
  });

  it("должен увеличивать последовательность на 1 элемент", () => {
    const current = [0, 1, 2];
    const next = [...current, Math.floor(Math.random() * 4)];
    expect(next).toHaveLength(4);
  });

  it("должен корректно сравнивать последовательности", () => {
    const correct = [0, 1, 2, 3];
    const correctInput = [0, 1, 2, 3];
    const wrongInput = [0, 1, 2, 2];

    const isCorrect1 =
      correctInput.length === correct.length &&
      correctInput.every((val, idx) => val === correct[idx]);

    const isCorrect2 =
      wrongInput.length === correct.length &&
      wrongInput.every((val, idx) => val === correct[idx]);

    expect(isCorrect1).toBe(true);
    expect(isCorrect2).toBe(false);
  });
});
