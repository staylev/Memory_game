import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle", // где будут храниться миграции
  dialect: "sqlite",
  dbCredentials: {
    url: "file:./sqlite.db",
  },
});