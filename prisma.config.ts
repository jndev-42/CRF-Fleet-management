import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma CLI needs a file:// URL for SQLite schema operations
    // The runtime adapter (PrismaLibSql) handles the actual Turso connection
    url: process.env["DATABASE_URL"] || "file:./prisma/dev.db",
  },
});
