import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use TURSO_DATABASE_URL in production, local file in dev
    url: process.env["TURSO_DATABASE_URL"] || process.env["DATABASE_URL"] || "file:./prisma/dev.db",
  },
});
