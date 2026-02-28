import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // This URL is only used by Prisma CLI for migrations or for internal Engine validation.
    // At runtime, the PrismaLibSql adapter overrides the actual connection.
    // Using 'file:./dev.db' as a valid SQLite URL string to prevent 'Invalid URL' errors during engine startup.
    url: "file:./dev.db",
  },
});
