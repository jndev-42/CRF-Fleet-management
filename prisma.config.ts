import "dotenv/config";
import { defineConfig } from "prisma/config";

// For Prisma CLI (migrations, db push), use the HTTPS endpoint
// The libsql:// URL is used at runtime by the libsql client adapter
const tursoUrl = process.env["TURSO_DATABASE_URL"] || "";
const httpUrl = tursoUrl.replace("libsql://", "https://");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: `${httpUrl}?authToken=${process.env["TURSO_AUTH_TOKEN"]}`,
  },
});
