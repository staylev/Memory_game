import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

// Типы для мок-контекста
export type MockUser = {
  id: string;
  email: string;
  name: string;
};

export type MockSession = {
  user: MockUser;
  session: { id: string; expiresAt: Date };
};

// Мок БД
export type MockDB = {
  query: {
    rooms: {
      findFirst: () => Promise<any>;
      findMany: () => Promise<any[]>;
    };
    roomPlayers: {
      findFirst: () => Promise<any>;
      findMany: () => Promise<any[]>;
    };
    gameHistory: {
      findFirst: () => Promise<any>;
      findMany: () => Promise<any[]>;
    };
  };
  insert: () => any;
  update: () => any;
  delete: () => any;
};

// Фабрика мок-БД
export function createMockDB(initialState: {
  rooms?: any[];
  roomPlayers?: any[];
  gameHistory?: any[];
} = {}): MockDB {
  const state = {
    rooms: initialState.rooms || [],
    roomPlayers: initialState.roomPlayers || [],
    gameHistory: initialState.gameHistory || [],
  };

  return {
    query: {
      rooms: {
        findFirst: async ({ where }: any) => {
          const conditions = parseWhere(where);
          return state.rooms.find((r) => matchesConditions(r, conditions)) || null;
        },
        findMany: async ({ where }: any) => {
          const conditions = parseWhere(where);
          return state.rooms.filter((r) => matchesConditions(r, conditions));
        },
      },
      roomPlayers: {
        findFirst: async ({ where }: any) => {
          const conditions = parseWhere(where);
          return state.roomPlayers.find((p) => matchesConditions(p, conditions)) || null;
        },
        findMany: async ({ where }: any) => {
          const conditions = parseWhere(where);
          return state.roomPlayers.filter((p) => matchesConditions(p, conditions));
        },
      },
      gameHistory: {
        findFirst: async () => null,
        findMany: async () => [],
      },
    },
    insert: () => ({
      values: (vals: any | any[]) => {
        const items = Array.isArray(vals) ? vals : [vals];
        items.forEach((item) => {
          if (item.roomId) state.roomPlayers.push(item);
          else if (item.totalRounds !== undefined) state.gameHistory.push(item);
          else state.rooms.push(item);
        });
        return { returning: async () => items };
      },
    }),
    update: () => ({
      set: (vals: any) => ({
        where: (where: any) => {
          const conditions = parseWhere(where);
          const roomIndex = state.rooms.findIndex((r) => matchesConditions(r, conditions));
          if (roomIndex !== -1) {
            state.rooms[roomIndex] = { ...state.rooms[roomIndex], ...vals };
          }
          const playerIndex = state.roomPlayers.findIndex((p) => matchesConditions(p, conditions));
          if (playerIndex !== -1) {
            state.roomPlayers[playerIndex] = { ...state.roomPlayers[playerIndex], ...vals };
          }
        },
      }),
    }),
    delete: () => ({
      where: () => {},
    }),
  };
}

// Простой парсер условий drizzle eq/and
function parseWhere(where: any): Array<{ field: string; value: any }> {
  if (!where) return [];
  
  // Обработка and()
  if (Array.isArray(where)) {
    return where.flatMap(parseWhere);
  }
  
  // Обработка eq()
  if (typeof where === "object" && where !== null) {
    if (where._type === "eq") {
      return [{ field: where.field, value: where.value }];
    }
    // Попытка извлечь из proxy объекта
    const entries = Object.entries(where);
    if (entries.length === 2 && entries[0][0] === "_type" && entries[0][1] === "eq") {
      return [{ field: entries[1][0], value: entries[1][1] }];
    }
  }
  
  return [];
}

function matchesConditions(item: any, conditions: Array<{ field: string; value: any }>): boolean {
  if (!conditions.length) return true;
  return conditions.every((cond) => {
    const itemValue = item[cond.field] || item[snakeToCamel(cond.field)];
    return itemValue === cond.value;
  });
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

// Создание тестового tRPC с мок-контекстом
export function createTestTRPC(mockDB: MockDB, session: MockSession | null) {
  const t = initTRPC.context<any>().create({
    transformer: superjson,
  });

  const publicProcedure = t.procedure;
  const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
        user: ctx.session.user,
      },
    });
  });

  const router = t.router;

  return {
    t,
    publicProcedure,
    protectedProcedure,
    router,
    createCaller: (routers: any) => {
      const appRouter = router(routers);
      return appRouter.createCaller({
        db: mockDB,
        session,
        headers: new Headers(),
      });
    },
  };
}

// Фабрика тестовых данных
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: `user-${Math.random().toString(36).slice(2, 8)}`,
    email: "test@test.com",
    name: "Test User",
    ...overrides,
  };
}

export function createMockRoom(overrides: any = {}): any {
  return {
    id: "ABC123",
    creatorId: "user-1",
    status: "waiting",
    currentSequence: null,
    currentRound: 1,
    maxPlayers: 4,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMockPlayer(overrides: any = {}): any {
  return {
    id: `player-${Math.random().toString(36).slice(2, 8)}`,
    roomId: "ABC123",
    userId: "user-1",
    isActive: true,
    joinedAt: new Date(),
    ...overrides,
  };
}
