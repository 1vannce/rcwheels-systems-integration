import "server-only";

import type { PgDatabase } from "drizzle-orm/pg-core";
import { drizzle, type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to connect to the database.");
}

// prepare: false is required by the Supabase pooler in transaction mode.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle({ client, schema });

// The root client or an open transaction. Repositories take this so they can
// join the caller's transaction.
export type Tx = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;
