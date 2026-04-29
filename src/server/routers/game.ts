import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { z } from "zod";
import { db } from "@/lib/db";
import { rooms, roomPlayers, gameHistory } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

// Вспомогательная функция: генерация уникального кода комнаты (6 символов)
function generateRoomCode(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

// Вспомогательная функция: генерация последовательности сигналов
// 0-красный, 1-синий, 2-зеленый, 3-желтый
function generateSequence(length: number): number[] {
  return Array.from({ length }, () => Math.floor(Math.random() * 4));
}

export const gameRouter = router({
  // Мутация: создание новой комнаты
  createRoom: protectedProcedure
    .input(
      z.object({
        maxPlayers: z.number().min(2).max(6).default(4),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user, db } = ctx;
      const { maxPlayers } = input;

      let roomCode: string;
      let existingRoom = null;
      do {
        roomCode = generateRoomCode();
        existingRoom = await db.query.rooms.findFirst({
          where: eq(rooms.id, roomCode),
        });
      } while (existingRoom);

      const [newRoom] = await db
        .insert(rooms)
        .values({
          id: roomCode,
          creatorId: user.id,
          maxPlayers: maxPlayers,
          status: "waiting",
          currentRound: 1,
        })
        .returning();

      await db.insert(roomPlayers).values({
        id: randomBytes(16).toString("hex"),
        roomId: roomCode,
        userId: user.id,
        isActive: true,
      });

      return {
        roomId: roomCode,
        room: newRoom,
      };
    }),

  // Мутация: подключение к существующей комнате
  joinRoom: protectedProcedure
    .input(
      z.object({
        roomId: z.string().length(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user, db } = ctx;
      const { roomId } = input;

      const room = await db.query.rooms.findFirst({
        where: eq(rooms.id, roomId),
      });

      if (!room) {
        throw new Error("Комната не найдена");
      }

      if (room.status !== "waiting") {
        throw new Error("Игра уже началась");
      }

      const players = await db.query.roomPlayers.findMany({
        where: eq(roomPlayers.roomId, roomId),
      });

      const maxPlayers = room.maxPlayers ?? 6;

      if (players.length >= maxPlayers) {
        throw new Error("Комната заполнена");
      }

      const alreadyJoined = players.some((p) => p.userId === user.id);
      if (alreadyJoined) {
        throw new Error("Вы уже в этой комнате");
      }

      await db.insert(roomPlayers).values({
        id: randomBytes(16).toString("hex"),
        roomId: roomId,
        userId: user.id,
        isActive: true,
      });

      return { success: true, room };
    }),

  // Запрос: получить информацию о комнате
  getRoom: publicProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ input }) => {
      const { roomId } = input;

      const room = await db.query.rooms.findFirst({
        where: eq(rooms.id, roomId),
      });

      if (!room) {
        throw new Error("Комната не найдена");
      }

      const players = await db.query.roomPlayers.findMany({
        where: eq(roomPlayers.roomId, roomId),
      });

      return {
        room,
        players: players.map((p) => ({
          userId: p.userId,
          isActive: p.isActive,
          joinedAt: p.joinedAt,
        })),
      };
    }),

  // Мутация: начать игру (только создатель комнаты)
  startGame: protectedProcedure
    .input(z.object({ roomId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { user, db } = ctx;
      const { roomId } = input;

      const room = await db.query.rooms.findFirst({
        where: eq(rooms.id, roomId),
      });

      if (!room) {
        throw new Error("Комната не найдена");
      }

      if (room.creatorId !== user.id) {
        throw new Error("Только создатель комнаты может начать игру");
      }

      const players = await db.query.roomPlayers.findMany({
        where: eq(roomPlayers.roomId, roomId),
      });

      if (players.length < 2) {
        throw new Error("Нужно минимум 2 игрока");
      }

      const initialSequence = generateSequence(2);
      const currentRound = (room.currentRound ?? 0) + 1;

      await db
        .update(rooms)
        .set({
          status: "playing",
          currentSequence: JSON.stringify(initialSequence),
          currentRound: currentRound,
        })
        .where(eq(rooms.id, roomId));

      return {
        success: true,
        sequence: initialSequence,
        round: currentRound,
      };
    }),

  // === РЕЖИМ ИГРЫ С БОТОМ ===

  // Мутация: создать комнату для игры с ботом
  createBotRoom: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { user, db } = ctx;

      let roomCode: string;
      let existingRoom = null;
      do {
        roomCode = generateRoomCode();
        existingRoom = await db.query.rooms.findFirst({
          where: eq(rooms.id, roomCode),
        });
      } while (existingRoom);

      const initialSequence = generateSequence(2);

      const [newRoom] = await db
        .insert(rooms)
        .values({
          id: roomCode,
          creatorId: user.id,
          maxPlayers: 1,
          status: "playing",
          currentSequence: JSON.stringify(initialSequence),
          currentRound: 1,
        })
        .returning();

      return {
        roomId: roomCode,
        sequence: initialSequence,
        room: newRoom,
      };
    }),

  // Мутация: проверить раунд с ботом
  playBotRound: protectedProcedure
    .input(
      z.object({
        roomId: z.string().length(6),
        sequence: z.array(z.number()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { roomId, sequence } = input;

      const room = await db.query.rooms.findFirst({
        where: eq(rooms.id, roomId),
      });

      if (!room || room.status !== "playing") {
        throw new Error("Игра не активна");
      }

      const correctSequence = JSON.parse(room.currentSequence || "[]");

      const isCorrect =
        sequence.length === correctSequence.length &&
        sequence.every((val, idx) => val === correctSequence[idx]);

      if (!isCorrect) {
        await db
          .update(rooms)
          .set({ status: "finished" })
          .where(eq(rooms.id, roomId));

        await db.insert(gameHistory).values({
          id: randomBytes(16).toString("hex"),
          roomId: roomId,
          totalRounds: room.currentRound,
        });

        return { correct: false, rounds: room.currentRound };
      }

      // Новый раунд — добавляем 1 цвет
      const newSequence = [...correctSequence, Math.floor(Math.random() * 4)];
      const newRound = (room.currentRound || 1) + 1;

      await db
        .update(rooms)
        .set({
          currentSequence: JSON.stringify(newSequence),
          currentRound: newRound,
        })
        .where(eq(rooms.id, roomId));

      return { correct: true, sequence: newSequence, round: newRound };
    }),

  // Мутация: проверить ответ игрока
  submitAnswer: protectedProcedure
    .input(
      z.object({
        roomId: z.string(),
        sequence: z.array(z.number()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user, db } = ctx;
      const { roomId, sequence } = input;

      const room = await db.query.rooms.findFirst({
        where: eq(rooms.id, roomId),
      });

      if (!room || room.status !== "playing") {
        throw new Error("Игра не активна");
      }

      const currentRound = room.currentRound ?? 1;
      const correctSequence = JSON.parse(room.currentSequence || "[]");

      const isCorrect =
        sequence.length === correctSequence.length &&
        sequence.every((val, idx) => val === correctSequence[idx]);

      if (!isCorrect) {
        await db
          .update(roomPlayers)
          .set({ isActive: false })
          .where(
            and(
              eq(roomPlayers.roomId, roomId),
              eq(roomPlayers.userId, user.id)
            )
          );

        const activePlayers = await db.query.roomPlayers.findMany({
          where: and(
            eq(roomPlayers.roomId, roomId),
            eq(roomPlayers.isActive, true)
          ),
        });

        if (activePlayers.length === 1) {
          const winner = activePlayers[0];

          await db
            .update(rooms)
            .set({ status: "finished" })
            .where(eq(rooms.id, roomId));

          await db.insert(gameHistory).values({
            id: randomBytes(16).toString("hex"),
            roomId: roomId,
            winnerId: winner.userId,
            totalRounds: currentRound,
          });

          return { finished: true, winnerId: winner.userId };
        }

        return { correct: false, finished: false };
      }

      return { correct: true, finished: false };
    }),
});