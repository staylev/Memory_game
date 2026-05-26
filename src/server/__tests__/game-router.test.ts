import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { randomBytes } from "crypto";

import {
  createMockDB,
  createMockUser,
  createMockRoom,
  createMockPlayer,
  type MockSession,
} from "./helpers";

// Создаём моки для процедур
const createMockProcedures = (mockDB: any, session: MockSession | null) => {
  const publicProcedure = {
    input: (schema: any) => ({
      query: (fn: any) => async (input: any) => {
        const validated = schema.parse(input);
        return fn({ input: validated, ctx: { db: mockDB, session, headers: new Headers() } });
      },
      mutation: (fn: any) => async (input: any) => {
        const validated = schema.parse(input);
        return fn({ input: validated, ctx: { db: mockDB, session, headers: new Headers() } });
      },
    }),
    query: (fn: any) => () => fn({ ctx: { db: mockDB, session, headers: new Headers() } }),
    mutation: (fn: any) => () => fn({ ctx: { db: mockDB, session, headers: new Headers() } }),
  };

  const protectedProcedure = {
    input: (schema: any) => ({
      mutation: (fn: any) => async (input: any) => {
        if (!session) throw new Error("UNAUTHORIZED");
        const validated = schema.parse(input);
        return fn({
          input: validated,
          ctx: { db: mockDB, session, user: session.user, headers: new Headers() },
        });
      },
      query: (fn: any) => async (input: any) => {
        if (!session) throw new Error("UNAUTHORIZED");
        const validated = schema.parse(input);
        return fn({
          input: validated,
          ctx: { db: mockDB, session, user: session.user, headers: new Headers() },
        });
      },
    }),
    mutation: (fn: any) => async () => {
      if (!session) throw new Error("UNAUTHORIZED");
      return fn({ ctx: { db: mockDB, session, user: session.user, headers: new Headers() } });
    },
  };

  return { publicProcedure, protectedProcedure };
};

// Упрощённая версия game router для тестов
const createGameRouter = (publicProcedure: any, protectedProcedure: any, z: any) => {
  function generateRoomCode(): string {
    return randomBytes(3).toString("hex").toUpperCase();
  }

  function generateSequence(length: number): number[] {
    return Array.from({ length }, () => Math.floor(Math.random() * 4));
  }

  function getNextActivePlayer(players: any[], currentUserId: string): string {
    const currentIndex = players.findIndex(p => p.userId === currentUserId);
    const nextIndex = (currentIndex + 1) % players.length;
    return players[nextIndex]?.userId || players[0]?.userId;
  }

  return {
    createRoom: protectedProcedure
      .input(z.object({ maxPlayers: z.number().min(2).max(6).default(4) }))
      .mutation(async ({ ctx, input }: any) => {
        const { user, db } = ctx;
        const { maxPlayers } = input;

        let roomCode: string;
        let existingRoom = null;
        do {
          roomCode = generateRoomCode();
          existingRoom = await db.query.rooms.findFirst({
            where: { field: "id", value: roomCode },
          });
        } while (existingRoom);

        const [newRoom] = await db
          .insert()
          .values({
            id: roomCode,
            creatorId: user.id,
            maxPlayers,
            status: "waiting",
            currentRound: 1,
            currentPlayerId: null,
            roundComplete: false,
            winnerId: null,
          })
          .returning();

        await db.insert().values({
          id: randomBytes(16).toString("hex"),
          roomId: roomCode,
          userId: user.id,
          isActive: true,
        });

        return { roomId: roomCode, room: newRoom };
      }),

    joinRoom: protectedProcedure
      .input(z.object({ roomId: z.string().length(6) }))
      .mutation(async ({ ctx, input }: any) => {
        const { user, db } = ctx;
        const { roomId } = input;

        const room = await db.query.rooms.findFirst({
          where: { field: "id", value: roomId },
        });

        if (!room) throw new Error("Комната не найдена");
        if (room.status !== "waiting") throw new Error("Игра уже началась");

        const players = await db.query.roomPlayers.findMany({
          where: { field: "roomId", value: roomId },
        });

        const maxPlayers = room.maxPlayers ?? 6;
        if (players.length >= maxPlayers) throw new Error("Комната заполнена");

        const alreadyJoined = players.some((p: any) => p.userId === user.id);
        if (alreadyJoined) throw new Error("Вы уже в этой комнате");

        await db.insert().values({
          id: randomBytes(16).toString("hex"),
          roomId,
          userId: user.id,
          isActive: true,
        });

        return { success: true, room };
      }),

    getRoom: publicProcedure
      .input(z.object({ roomId: z.string() }))
      .query(async ({ input, ctx }: any) => {
        const { roomId } = input;
        const { db } = ctx;

        const room = await db.query.rooms.findFirst({
          where: { field: "id", value: roomId },
        });

        if (!room) throw new Error("Комната не найдена");

        const players = await db.query.roomPlayers.findMany({
          where: { field: "roomId", value: roomId },
        });

        return {
          room,
          players: players.map((p: any) => ({
            userId: p.userId,
            isActive: p.isActive,
            joinedAt: p.joinedAt,
          })),
        };
      }),

    startGame: protectedProcedure
      .input(z.object({ roomId: z.string() }))
      .mutation(async ({ ctx, input }: any) => {
        const { user, db } = ctx;
        const { roomId } = input;

        const room = await db.query.rooms.findFirst({
          where: { field: "id", value: roomId },
        });

        if (!room) throw new Error("Комната не найдена");
        if (room.creatorId !== user.id) throw new Error("Только создатель комнаты может начать игру");

        const players = await db.query.roomPlayers.findMany({
          where: { field: "roomId", value: roomId },
        });

        if (players.length < 2) throw new Error("Нужно минимум 2 игрока");

        const initialSequence = generateSequence(2);
        const currentRound = (room.currentRound ?? 0) + 1;
        const firstPlayerId = players[0]?.userId;

        await db
          .update()
          .set({
            status: "playing",
            currentSequence: JSON.stringify(initialSequence),
            currentRound,
            currentPlayerId: firstPlayerId,
            roundComplete: false,
          })
          .where({ field: "id", value: roomId });

        return { success: true, sequence: initialSequence, round: currentRound, currentPlayerId: firstPlayerId };
      }),

    submitAnswer: protectedProcedure
      .input(z.object({ roomId: z.string(), sequence: z.array(z.number()) }))
      .mutation(async ({ ctx, input }: any) => {
        const { user, db } = ctx;
        const { roomId, sequence } = input;

        const room = await db.query.rooms.findFirst({
          where: { field: "id", value: roomId },
        });

        if (!room || room.status !== "playing") throw new Error("Игра не активна");
        if (room.currentPlayerId !== user.id) throw new Error("Сейчас не ваш ход");

        const currentRound = room.currentRound ?? 1;
        const correctSequence = JSON.parse(room.currentSequence || "[]");

        const isCorrect =
          sequence.length === correctSequence.length &&
          sequence.every((val: number, idx: number) => val === correctSequence[idx]);

        if (!isCorrect) {
          // Игра завершается сразу, победитель — другой игрок
          const allPlayers = await db.query.roomPlayers.findMany({
            where: { field: "roomId", value: roomId },
          });
          const winner = allPlayers.find((p: any) => p.userId !== user.id);

          await db
            .update()
            .set({
              status: "finished",
              currentPlayerId: null,
              roundComplete: false,
              winnerId: winner?.userId || null,
            })
            .where({ field: "id", value: roomId });

          await db.insert().values({
            id: randomBytes(16).toString("hex"),
            roomId,
            winnerId: winner?.userId || null,
            totalRounds: currentRound,
          });

          return { finished: true, winnerId: winner?.userId || null };
        }

        // Правильный ответ — переключаем на следующего игрока
        const allPlayers = await db.query.roomPlayers.findMany({
          where: { field: "roomId", value: roomId },
          orderBy: { field: "joinedAt", order: "asc" },
        });

        const activePlayers = allPlayers.filter((p: any) => p.isActive);
        const nextPlayerId = getNextActivePlayer(activePlayers, user.id);
        const firstPlayerId = activePlayers[0]?.userId;
        const roundComplete = nextPlayerId === firstPlayerId;

        await db
          .update()
          .set({
            currentPlayerId: nextPlayerId,
            roundComplete,
          })
          .where({ field: "id", value: roomId });

        return { correct: true, finished: false, nextPlayerId, roundComplete };
      }),

    nextRound: protectedProcedure
      .input(z.object({ roomId: z.string() }))
      .mutation(async ({ ctx, input }: any) => {
        const { db } = ctx;
        const { roomId } = input;

        const room = await db.query.rooms.findFirst({
          where: { field: "id", value: roomId },
        });

        if (!room) throw new Error("Комната не найдена");

        const correctSequence = JSON.parse(room.currentSequence || "[]");
        const newSequence = [...correctSequence, Math.floor(Math.random() * 4)];
        const newRound = (room.currentRound ?? 0) + 1;

        const players = await db.query.roomPlayers.findMany({
          where: { field: "roomId", value: roomId },
          orderBy: { field: "joinedAt", order: "asc" },
        });
        const currentPlayerId = players[0]?.userId || room.creatorId;

        await db
          .update()
          .set({
            currentSequence: JSON.stringify(newSequence),
            currentRound: newRound,
            currentPlayerId,
            roundComplete: false,
          })
          .where({ field: "id", value: roomId });

        return {
          success: true,
          sequence: newSequence,
          round: newRound,
          currentPlayerId,
        };
      }),

    leaveRoom: protectedProcedure
      .input(z.object({ roomId: z.string() }))
      .mutation(async ({ ctx, input }: any) => {
        const { user, db } = ctx;
        const { roomId } = input;

        const room = await db.query.rooms.findFirst({
          where: { field: "id", value: roomId },
        });

        if (!room) throw new Error("Комната не найдена");

        await db
          .delete()
          .where({ field: "roomId", value: roomId, userId: user.id });

        const remainingPlayers = await db.query.roomPlayers.findMany({
          where: { field: "roomId", value: roomId },
        });

        if (remainingPlayers.length === 0) {
          await db
            .delete()
            .where({ field: "id", value: roomId });
        }

        return { success: true };
      }),

    createBotRoom: protectedProcedure.mutation(async ({ ctx }: any) => {
      const { user, db } = ctx;

      let roomCode: string;
      let existingRoom = null;
      do {
        roomCode = generateRoomCode();
        existingRoom = await db.query.rooms.findFirst({
          where: { field: "id", value: roomCode },
        });
      } while (existingRoom);

      const initialSequence = generateSequence(2);

      const [newRoom] = await db
        .insert()
        .values({
          id: roomCode,
          creatorId: user.id,
          maxPlayers: 1,
          status: "playing",
          currentSequence: JSON.stringify(initialSequence),
          currentRound: 1,
          currentPlayerId: user.id,
          roundComplete: false,
          winnerId: null,
        })
        .returning();

      return { roomId: roomCode, sequence: initialSequence, room: newRoom };
    }),

    playBotRound: protectedProcedure
      .input(z.object({ roomId: z.string().length(6), sequence: z.array(z.number()) }))
      .mutation(async ({ ctx, input }: any) => {
        const { db } = ctx;
        const { roomId, sequence } = input;

        const room = await db.query.rooms.findFirst({
          where: { field: "id", value: roomId },
        });

        if (!room || room.status !== "playing") throw new Error("Игра не активна");

        const correctSequence = JSON.parse(room.currentSequence || "[]");

        const isCorrect =
          sequence.length === correctSequence.length &&
          sequence.every((val: number, idx: number) => val === correctSequence[idx]);

        if (!isCorrect) {
          await db.update().set({ status: "finished", currentPlayerId: null }).where({ field: "id", value: roomId });

          await db.insert().values({
            id: randomBytes(16).toString("hex"),
            roomId,
            totalRounds: room.currentRound,
          });

          return { correct: false, rounds: room.currentRound };
        }

        const newSequence = [...correctSequence, Math.floor(Math.random() * 4)];
        const newRound = (room.currentRound || 1) + 1;

        await db
          .update()
          .set({
            currentSequence: JSON.stringify(newSequence),
            currentRound: newRound,
          })
          .where({ field: "id", value: roomId });

        return { correct: true, sequence: newSequence, round: newRound };
      }),
  };
};

describe("Game Router Integration Tests", () => {
  let mockUser: any;
  let mockSession: MockSession;
  let mockDB: any;
  let gameRouter: any;
  let publicProcedure: any;
  let protectedProcedure: any;

  beforeEach(() => {
    mockUser = createMockUser();
    mockSession = {
      user: mockUser,
      session: { id: "session-1", expiresAt: new Date() },
    };
    mockDB = createMockDB();
    const procs = createMockProcedures(mockDB, mockSession);
    publicProcedure = procs.publicProcedure;
    protectedProcedure = procs.protectedProcedure;
    gameRouter = createGameRouter(publicProcedure, protectedProcedure, z);
  });

  describe("createRoom", () => {
    it("должен создавать новую комнату с валидными параметрами", async () => {
      const result = await gameRouter.createRoom({ maxPlayers: 4 });
      expect(result.roomId).toHaveLength(6);
      expect(result.room.status).toBe("waiting");
      expect(result.room.maxPlayers).toBe(4);
    });

    it("должен добавлять создателя в комнату", async () => {
      await gameRouter.createRoom({ maxPlayers: 4 });
      const players = await mockDB.query.roomPlayers.findMany({
        where: { field: "roomId", value: "ABC123" },
      });
      expect(players.length).toBeGreaterThan(0);
    });

    it("должен использовать maxPlayers по умолчанию 4", async () => {
      const result = await gameRouter.createRoom({});
      expect(result.room.maxPlayers).toBe(4);
    });

    it("должен отклонять maxPlayers < 2", async () => {
      await expect(gameRouter.createRoom({ maxPlayers: 1 })).rejects.toThrow();
    });

    it("должен отклонять maxPlayers > 6", async () => {
      await expect(gameRouter.createRoom({ maxPlayers: 7 })).rejects.toThrow();
    });
  });

  describe("joinRoom", () => {
    it("должен подключать игрока к существующей комнате", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      
      const user2 = createMockUser({ id: "user-2" });
      const session2 = { user: user2, session: { id: "session-2", expiresAt: new Date() } };
      const procs2 = createMockProcedures(mockDB, session2);
      const router2 = createGameRouter(procs2.publicProcedure, procs2.protectedProcedure, z);
      
      const result = await router2.joinRoom({ roomId });
      expect(result.success).toBe(true);
    });

    it("должен отклонять подключение к несуществующей комнате", async () => {
      const user2 = createMockUser({ id: "user-2" });
      const session2 = { user: user2, session: { id: "session-2", expiresAt: new Date() } };
      const procs2 = createMockProcedures(mockDB, session2);
      const router2 = createGameRouter(procs2.publicProcedure, procs2.protectedProcedure, z);
      
      await expect(router2.joinRoom({ roomId: "123456" })).rejects.toThrow("Комната не найдена");
    });

    it("должен отклонять подключение если комната заполнена", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 2 });
      
      const user2 = createMockUser({ id: "user-2" });
      const session2 = { user: user2, session: { id: "session-2", expiresAt: new Date() } };
      const procs2 = createMockProcedures(mockDB, session2);
      const router2 = createGameRouter(procs2.publicProcedure, procs2.protectedProcedure, z);
      
      await router2.joinRoom({ roomId });
      
      const user3 = createMockUser({ id: "user-3" });
      const session3 = { user: user3, session: { id: "session-3", expiresAt: new Date() } };
      const procs3 = createMockProcedures(mockDB, session3);
      const router3 = createGameRouter(procs3.publicProcedure, procs3.protectedProcedure, z);
      
      await expect(router3.joinRoom({ roomId })).rejects.toThrow("Комната заполнена");
    });

    it("должен отклонять повторное подключение", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      await expect(gameRouter.joinRoom({ roomId })).rejects.toThrow("Вы уже в этой комнате");
    });
  });

  describe("getRoom", () => {
    it("должен возвращать информацию о комнате", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      const result = await gameRouter.getRoom({ roomId });
      expect(result.room.id).toBe(roomId);
      expect(result.players.length).toBe(1);
    });

    it("должен выбрасывать ошибку для несуществующей комнаты", async () => {
      await expect(gameRouter.getRoom({ roomId: "INVALID" })).rejects.toThrow("Комната не найдена");
    });
  });

  describe("startGame", () => {
    it("должен начинать игру если есть минимум 2 игрока", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      
      const user2 = createMockUser({ id: "user-2" });
      const session2 = { user: user2, session: { id: "session-2", expiresAt: new Date() } };
      const procs2 = createMockProcedures(mockDB, session2);
      const router2 = createGameRouter(procs2.publicProcedure, procs2.protectedProcedure, z);
      await router2.joinRoom({ roomId });
      
      const result = await gameRouter.startGame({ roomId });
      expect(result.success).toBe(true);
      expect(result.sequence).toHaveLength(2);
      expect(result.round).toBe(2);
      expect(result.currentPlayerId).toBeDefined();
    });

    it("должен отклонять если меньше 2 игроков", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      await expect(gameRouter.startGame({ roomId })).rejects.toThrow("Нужно минимум 2 игрока");
    });

    it("должен отклонять если не создатель", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      
      const user2 = createMockUser({ id: "user-2" });
      const session2 = { user: user2, session: { id: "session-2", expiresAt: new Date() } };
      const procs2 = createMockProcedures(mockDB, session2);
      const router2 = createGameRouter(procs2.publicProcedure, procs2.protectedProcedure, z);
      await router2.joinRoom({ roomId });
      
      await expect(router2.startGame({ roomId })).rejects.toThrow("Только создатель комнаты может начать игру");
    });
  });

  describe("submitAnswer", () => {
    it("должен принимать правильную последовательность", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      
      const user2 = createMockUser({ id: "user-2" });
      const session2 = { user: user2, session: { id: "session-2", expiresAt: new Date() } };
      const procs2 = createMockProcedures(mockDB, session2);
      const router2 = createGameRouter(procs2.publicProcedure, procs2.protectedProcedure, z);
      await router2.joinRoom({ roomId });
      
      const startResult = await gameRouter.startGame({ roomId });
      
      // Ходит первый игрок (создатель)
      const result = await gameRouter.submitAnswer({ roomId, sequence: startResult.sequence });
      expect(result.correct).toBe(true);
      expect(result.finished).toBe(false);
    });

    it("должен отклонять неправильную последовательность и завершать игру", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      
      const user2 = createMockUser({ id: "user-2" });
      const session2 = { user: user2, session: { id: "session-2", expiresAt: new Date() } };
      const procs2 = createMockProcedures(mockDB, session2);
      const router2 = createGameRouter(procs2.publicProcedure, procs2.protectedProcedure, z);
      await router2.joinRoom({ roomId });
      
      const startResult = await gameRouter.startGame({ roomId });
      
      const wrongSequence = startResult.sequence.map((n: number) => (n + 1) % 4);
      const result = await gameRouter.submitAnswer({ roomId, sequence: wrongSequence });
      expect(result.finished).toBe(true);
      expect(result.winnerId).toBe(user2.id);
    });

    it("должен отклонять ход не в свою очередь", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      
      const user2 = createMockUser({ id: "user-2" });
      const session2 = { user: user2, session: { id: "session-2", expiresAt: new Date() } };
      const procs2 = createMockProcedures(mockDB, session2);
      const router2 = createGameRouter(procs2.publicProcedure, procs2.protectedProcedure, z);
      await router2.joinRoom({ roomId });
      
      await gameRouter.startGame({ roomId });
      
      // Второй игрок пытается ходить первым
      await expect(router2.submitAnswer({ roomId, sequence: [0, 0] })).rejects.toThrow("Сейчас не ваш ход");
    });

    it("должен возвращать roundComplete когда раунд завершён", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      
      const user2 = createMockUser({ id: "user-2" });
      const session2 = { user: user2, session: { id: "session-2", expiresAt: new Date() } };
      const procs2 = createMockProcedures(mockDB, session2);
      const router2 = createGameRouter(procs2.publicProcedure, procs2.protectedProcedure, z);
      await router2.joinRoom({ roomId });
      
      const startResult = await gameRouter.startGame({ roomId });
      
      // Первый игрок ходит правильно
      await gameRouter.submitAnswer({ roomId, sequence: startResult.sequence });
      
      // Второй игрок ходит правильно — раунд завершён (следующий = первый)
      const result = await router2.submitAnswer({ roomId, sequence: startResult.sequence });
      expect(result.correct).toBe(true);
      expect(result.roundComplete).toBe(true);
    });
  });

  describe("nextRound", () => {
    it("должен увеличивать последовательность и сбрасывать roundComplete", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      
      const user2 = createMockUser({ id: "user-2" });
      const session2 = { user: user2, session: { id: "session-2", expiresAt: new Date() } };
      const procs2 = createMockProcedures(mockDB, session2);
      const router2 = createGameRouter(procs2.publicProcedure, procs2.protectedProcedure, z);
      await router2.joinRoom({ roomId });
      
      const startResult = await gameRouter.startGame({ roomId });
      
      // Завершаем раунд
      await gameRouter.submitAnswer({ roomId, sequence: startResult.sequence });
      await router2.submitAnswer({ roomId, sequence: startResult.sequence });
      
      const result = await gameRouter.nextRound({ roomId });
      expect(result.sequence).toHaveLength(3);
      expect(result.round).toBe(3);
      
      const room = await mockDB.query.rooms.findFirst({ where: { field: "id", value: roomId } });
      expect(room.roundComplete).toBe(false);
    });
  });

  describe("leaveRoom", () => {
    it("должен позволять игроку покинуть комнату", async () => {
      const { roomId } = await gameRouter.createRoom({ maxPlayers: 4 });
      const result = await gameRouter.leaveRoom({ roomId });
      expect(result.success).toBe(true);
    });
  });

  describe("createBotRoom", () => {
    it("должен создавать комнату для игры с ботом", async () => {
      const result = await gameRouter.createBotRoom();
      expect(result.roomId).toHaveLength(6);
      expect(result.room.status).toBe("playing");
      expect(result.room.maxPlayers).toBe(1);
      expect(result.sequence).toHaveLength(2);
    });
  });

  describe("playBotRound", () => {
    it("должен принимать правильную последовательность", async () => {
      const { roomId, sequence } = await gameRouter.createBotRoom();
      
      const result = await gameRouter.playBotRound({ roomId, sequence });
      expect(result.correct).toBe(true);
      expect(result.sequence).toHaveLength(3);
      expect(result.round).toBe(2);
    });

    it("должен отклонять неправильную последовательность", async () => {
      const { roomId, sequence } = await gameRouter.createBotRoom();
      
      const wrongSequence = sequence.map((n: number) => (n + 1) % 4);
      const result = await gameRouter.playBotRound({ roomId, sequence: wrongSequence });
      expect(result.correct).toBe(false);
      expect(result.rounds).toBe(1);
    });

    it("должен увеличивать последовательность на 1", async () => {
      let { roomId, sequence } = await gameRouter.createBotRoom();
      
      let result = await gameRouter.playBotRound({ roomId, sequence });
      expect(result.sequence).toHaveLength(3);
      
      result = await gameRouter.playBotRound({ roomId, sequence: result.sequence });
      expect(result.sequence).toHaveLength(4);
      
      result = await gameRouter.playBotRound({ roomId, sequence: result.sequence });
      expect(result.sequence).toHaveLength(5);
    });
  });
});
