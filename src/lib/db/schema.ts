import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ========== ТАБЛИЦЫ BETTER-AUTH (точные имена полей) ==========

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  name: text("name").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id),
  accountId: text("accountId").notNull(), // <- ЭТО ПОЛЕ ОБЯЗАТЕЛЬНО
  providerId: text("providerId").notNull(),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

// ========== ТАБЛИЦЫ ИГРЫ ==========

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id").references(() => user.id),
  status: text("status", { enum: ["waiting", "playing", "finished"] }).default("waiting"),
  currentSequence: text("current_sequence"),
  currentRound: integer("current_round").default(1),
  maxPlayers: integer("max_players").default(6),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const roomPlayers = sqliteTable("room_players", {
  id: text("id").primaryKey(),
  roomId: text("room_id").references(() => rooms.id),
  userId: text("user_id").references(() => user.id),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  joinedAt: integer("joined_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const gameHistory = sqliteTable("game_history", {
  id: text("id").primaryKey(),
  roomId: text("room_id").references(() => rooms.id),
  winnerId: text("winner_id").references(() => user.id),
  totalRounds: integer("total_rounds"),
  finishedAt: integer("finished_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});