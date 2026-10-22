import "server-only";

import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | undefined;

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for server data access.");
  client ??= neon(connectionString);
  return client;
}

export function queryRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) throw new Error("Database returned an unexpected result format.");
  return result as T[];
}
