import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { z } from "zod";
import { db } from "@/lib/db";
import { rooms, roomPlayers, gameHistory, user } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
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

// Вспомогательная функция: получить следующего активного игрока
function getNextActivePlayer(players: Array<{ userId: string | null }>, currentUserId: string): string {
  const activeIds = players.map(p => p.userId).filter((id): id is string => id != null);
  const currentIndex = activeIds.indexOf(currentUserId);
  const nextIndex = (currentIndex + 1) % activeIds.length;
  return activeIds[nextIndex];
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

      // Получаем имена игроков через JOIN с таблицей user
      const userIds = players.map((p) => p.userId).filter((id): id is string => id != null);
      const users = await db.query.user.findMany({
        where: inArray(user.id, userIds),
      });

      // Создаем карту userId -> name
      const userMap = new Map(users.map((u) => [u.id, u.name]));

      return {
        room,
        players: players.map((p) => ({
          userId: p.userId,
          name: p.userId ? userMap.get(p.userId) : undefined,
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
        orderBy: (players, { asc }) => [asc(players.joinedAt)],
      });

      if (players.length < 2) {
        throw new Error("Нужно минимум 2 игрока");
      }

      const initialSequence = generateSequence(2);
      const currentRound = (room.currentRound ?? 0) + 1;
      // Первый ход у создателя
      const currentPlayerId = players.find(p => p.userId === room.creatorId)?.userId || players[0].userId;

      await db
        .update(rooms)
        .set({
          status: "playing",
          currentSequence: JSON.stringify(initialSequence),
          currentRound: currentRound,
          currentPlayerId: currentPlayerId,
        })
        .where(eq(rooms.id, roomId));

      return {
        success: true,
        sequence: initialSequence,
        round: currentRound,
        currentPlayerId,
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

  // Мутация: покинуть комнату
  leaveRoom: protectedProcedure
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

      // Удаляем игрока из комнаты
      await db
        .delete(roomPlayers)
        .where(
          and(
            eq(roomPlayers.roomId, roomId),
            eq(roomPlayers.userId, user.id)
          )
        );

      // Если комната пуста и игра не началась, удаляем комнату
      const remainingPlayers = await db.query.roomPlayers.findMany({
        where: eq(roomPlayers.roomId, roomId),
      });

      if (remainingPlayers.length === 0 && room.status === "waiting") {
        await db.delete(rooms).where(eq(rooms.id, roomId));
      }

      return { success: true };
    }),

  // Мутация: следующий раунд (вызывается создателем после всех игроков)
  nextRound: protectedProcedure
    .input(
      z.object({
        roomId: z.string(),
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

      // Увеличиваем последовательность
      const correctSequence = JSON.parse(room.currentSequence || "[]");
      const newSequence = [...correctSequence, Math.floor(Math.random() * 4)];
      const newRound = (room.currentRound ?? 0) + 1;

      // Сбрасываем текущего игрока на создателя
      const players = await db.query.roomPlayers.findMany({
        where: eq(roomPlayers.roomId, roomId),
        orderBy: (players, { asc }) => [asc(players.joinedAt)],
      });
      const currentPlayerId = players[0]?.userId || room.creatorId;

      await db
        .update(rooms)
        .set({
          currentSequence: JSON.stringify(newSequence),
          currentRound: newRound,
          currentPlayerId: currentPlayerId,
          roundComplete: false,
        })
        .where(eq(rooms.id, roomId));

      return {
        success: true,
        sequence: newSequence,
        round: newRound,
        currentPlayerId,
      };
    }),

  // Запрос: получить историю игр пользователя
  getGameHistory: protectedProcedure
    .query(async ({ ctx }) => {
      const { user, db } = ctx;

      const history = await db.query.gameHistory.findMany();

      // Получаем детали комнат и сортируем по дате
      const result = await Promise.all(
        history.map(async (record) => {
          const room = record.roomId
            ? await db.query.rooms.findFirst({
                where: eq(rooms.id, record.roomId),
              })
            : null;

          const isWinner = record.winnerId === user.id;
          const isBotGame = room?.maxPlayers === 1;

          return {
            id: record.id,
            roomId: record.roomId,
            totalRounds: record.totalRounds,
            finishedAt: record.finishedAt,
            isWinner,
            isBotGame,
            winnerId: record.winnerId,
            mode: isBotGame ? "bot" : "multiplayer",
          };
        })
      );

      // Сортируем по дате завершения (новые сначала)
      result.sort((a, b) => {
        if (!a.finishedAt) return 1;
        if (!b.finishedAt) return -1;
        return new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime();
      });

      return result;
    }),
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

      // Проверяем, что это ход текущего игрока
      if (room.currentPlayerId !== user.id) {
        throw new Error("Сейчас не ваш ход");
      }

      const currentRound = room.currentRound ?? 1;
      const correctSequence = JSON.parse(room.currentSequence || "[]");

      const isCorrect =
        sequence.length === correctSequence.length &&
        sequence.every((val, idx) => val === correctSequence[idx]);

      if (!isCorrect) {
        // Игрок ввёл неправильно — игра завершается сразу
        // Победитель — другой активный игрок
        const otherActivePlayers = await db.query.roomPlayers.findMany({
          where: and(
            eq(roomPlayers.roomId, roomId),
            eq(roomPlayers.isActive, true),
            // Исключаем текущего игрока
          ),
          orderBy: (players, { asc }) => [asc(players.joinedAt)],
        });

        // Исключаем текущего игрока из списка
        const winner = otherActivePlayers.find(p => p.userId !== user.id);
        
        await db
          .update(rooms)
          .set({ 
            status: "finished", 
            currentPlayerId: null,
            roundComplete: false,
            winnerId: winner?.userId || null,
          })
          .where(eq(rooms.id, roomId));

        await db.insert(gameHistory).values({
          id: randomBytes(16).toString("hex"),
          roomId: roomId,
          winnerId: winner?.userId || null,
          totalRounds: currentRound,
        });

        return { finished: true, winnerId: winner?.userId || null };
      }

      // Правильный ответ - переключаем на следующего игрока
      const allPlayers = await db.query.roomPlayers.findMany({
        where: eq(roomPlayers.roomId, roomId),
        orderBy: (players, { asc }) => [asc(players.joinedAt)],
      });

      const activePlayers = allPlayers.filter(p => p.isActive);
      const nextPlayerId = getNextActivePlayer(activePlayers, user.id);

      // Проверяем, завершился ли раунд (следующий игрок — первый в списке)
      const firstPlayerId = activePlayers[0]?.userId;
      const roundComplete = nextPlayerId === firstPlayerId;

      await db
        .update(rooms)
        .set({ 
          currentPlayerId: nextPlayerId,
          roundComplete: roundComplete,
        })
        .where(eq(rooms.id, roomId));

      return { correct: true, finished: false, nextPlayerId, roundComplete };
    }),
});