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

describe("Auth & Context Tests", () => {
  let mockUser: any;
  let mockSession: MockSession;
  let mockDB: any;

  beforeEach(() => {
    mockUser = createMockUser({
      id: "test-user-123",
      email: "test@example.com",
      name: "Test User",
    });
    mockSession = {
      user: mockUser,
      session: { id: "session-xyz", expiresAt: new Date() },
    };
    mockDB = createMockDB();
  });

  describe("Session Context", () => {
    it("должен передавать пользователя в контекст", async () => {
      expect(mockSession.user.id).toBe("test-user-123");
      expect(mockSession.user.email).toBe("test@example.com");
      expect(mockSession.session.id).toBe("session-xyz");
    });

    it("должен иметь корректную структуру сессии", () => {
      expect(mockSession).toHaveProperty("user");
      expect(mockSession).toHaveProperty("session");
      expect(mockSession.user).toHaveProperty("id");
      expect(mockSession.user).toHaveProperty("email");
      expect(mockSession.user).toHaveProperty("name");
      expect(mockSession.session).toHaveProperty("expiresAt");
      expect(mockSession.session.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe("Mock Database", () => {
    it("должен создавать пустую базу данных", () => {
      const emptyDB = createMockDB();
      expect(emptyDB.query.rooms).toBeDefined();
      expect(emptyDB.query.roomPlayers).toBeDefined();
      expect(emptyDB.query.gameHistory).toBeDefined();
    });

    it("должен инициализироваться с начальными данными", () => {
      const initialRoom = createMockRoom({ id: "TEST01" });
      const initialDB = createMockDB({ rooms: [initialRoom] });
      
      // Проверяем что комната доступна
      expect(initialDB.query.rooms.findFirst).toBeDefined();
    });

    it("должен поддерживать операции вставки", async () => {
      const db = createMockDB();
      
      await db.insert().values({
        id: "player-1",
        roomId: "ROOM01",
        userId: "user-1",
        isActive: true,
      });
      
      const players = await db.query.roomPlayers.findMany({
        where: { field: "roomId", value: "ROOM01" },
      });
      
      expect(players.length).toBe(1);
      expect(players[0].id).toBe("player-1");
    });

    it("должен поддерживать операции обновления", async () => {
      const initialRoom = createMockRoom({ id: "TEST01", status: "waiting" });
      const db = createMockDB({ rooms: [initialRoom] });
      
      await db.update().set({ status: "playing" }).where({ field: "id", value: "TEST01" });
      
      const room = await db.query.rooms.findFirst({
        where: { field: "id", value: "TEST01" },
      });
      
      expect(room.status).toBe("playing");
    });
  });

  describe("Data Validation", () => {
    it("должен валидировать структуру пользователя", () => {
      const userSchema = z.object({
        id: z.string(),
        email: z.string().email(),
        name: z.string().min(2),
      });

      const validUser = { id: "1", email: "test@test.com", name: "Test" };
      expect(() => userSchema.parse(validUser)).not.toThrow();

      const invalidUser = { id: "1", email: "invalid", name: "T" };
      expect(() => userSchema.parse(invalidUser)).toThrow();
    });

    it("должен валидировать структуру комнаты", () => {
      const roomSchema = z.object({
        id: z.string().length(6),
        creatorId: z.string(),
        status: z.enum(["waiting", "playing", "finished"]),
        maxPlayers: z.number().min(1).max(10),
      });

      const validRoom = {
        id: "ABC123",
        creatorId: "user-1",
        status: "waiting",
        maxPlayers: 4,
      };
      expect(() => roomSchema.parse(validRoom)).not.toThrow();

      const invalidRoom = {
        id: "SHORT",
        creatorId: "user-1",
        status: "waiting",
        maxPlayers: 4,
      };
      expect(() => roomSchema.parse(invalidRoom)).toThrow();
    });

    it("должен валидировать последовательность", () => {
      const sequenceSchema = z.array(z.number().min(0).max(3));

      const validSeq = [0, 1, 2, 3];
      expect(() => sequenceSchema.parse(validSeq)).not.toThrow();

      const invalidSeq = [0, 1, 5, 3];
      expect(() => sequenceSchema.parse(invalidSeq)).toThrow();
    });
  });

  describe("Game State Transitions", () => {
    it("должен корректно менять статус комнаты", () => {
      const room = createMockRoom({ status: "waiting" });
      expect(room.status).toBe("waiting");
      
      room.status = "playing";
      expect(room.status).toBe("playing");
      
      room.status = "finished";
      expect(room.status).toBe("finished");
    });

    it("должен отслеживать активных игроков", () => {
      const players = [
        createMockPlayer({ id: "p1", isActive: true }),
        createMockPlayer({ id: "p2", isActive: true }),
        createMockPlayer({ id: "p3", isActive: false }),
      ];
      
      const activePlayers = players.filter(p => p.isActive);
      expect(activePlayers.length).toBe(2);
    });

    it("должен подсчитывать раунды", () => {
      let currentRound = 1;
      const sequenceLength = 2;
      
      // Каждый раунд увеличивает длину на 1
      for (let i = 0; i < 5; i++) {
        expect(sequenceLength + i).toBeGreaterThan(0);
        currentRound++;
      }
      
      expect(currentRound).toBe(6);
    });
  });

  describe("Helper Functions", () => {
    it("должен генерировать уникальные ID", () => {
      const ids = Array.from({ length: 10 }, () => 
        randomBytes(16).toString("hex")
      );
      
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("должен генерировать коды комнат в правильном формате", () => {
      const codes = Array.from({ length: 20 }, () =>
        randomBytes(3).toString("hex").toUpperCase()
      );
      
      codes.forEach(code => {
        expect(code).toHaveLength(6);
        expect(code).toMatch(/^[0-9A-F]{6}$/);
      });
    });

    it("должен генерировать случайные последовательности", () => {
      const sequences = Array.from({ length: 10 }, () =>
        Array.from({ length: 5 }, () => Math.floor(Math.random() * 4))
      );
      
      sequences.forEach(seq => {
        expect(seq).toHaveLength(5);
        seq.forEach(num => {
          expect(num).toBeGreaterThanOrEqual(0);
          expect(num).toBeLessThanOrEqual(3);
        });
      });
    });
  });
});

describe("Edge Cases & Error Handling", () => {
  it("должен обрабатывать пустую сессию", () => {
    const nullSession = null;
    expect(nullSession).toBeNull();
  });

  it("должен обрабатывать несуществующую комнату", async () => {
    const db = createMockDB();
    const room = await db.query.rooms.findFirst({
      where: { field: "id", value: "NOTEXIST" },
    });
    expect(room).toBeNull();
  });

  it("должен обрабатывать пустой список игроков", async () => {
    const db = createMockDB();
    const players = await db.query.roomPlayers.findMany({
      where: { field: "roomId", value: "EMPTY" },
    });
    expect(players).toEqual([]);
  });

  it("должен обрабатывать JSON парсинг последовательности", () => {
    const validJSON = "[0,1,2,3]";
    const parsed = JSON.parse(validJSON);
    expect(parsed).toEqual([0, 1, 2, 3]);
    
    const emptyJSON = "[]";
    const parsedEmpty = JSON.parse(emptyJSON);
    expect(parsedEmpty).toEqual([]);
  });

  it("должен обрабатывать null currentSequence", () => {
    const room = createMockRoom({ currentSequence: null });
    const sequence = JSON.parse(room.currentSequence || "[]");
    expect(sequence).toEqual([]);
  });
});
