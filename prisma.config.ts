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
    // Using 'file:/tmp/dev.db' to ensure the path corresponds to a writable location on Vercel
    url: "file:/tmp/dev.db",
  },
});
