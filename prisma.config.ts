import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // This URL is only used by Prisma CLI for migrations.
    // At runtime, the PrismaLibSql adapter overrides the actual connection.
    // Using 'file:' as a minimal valid SQLite URL to prevent 'Invalid URL' errors.
    url: "file:",
  },
});
