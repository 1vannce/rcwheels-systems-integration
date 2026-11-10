import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { resolveTestDatabaseUrl } from "./test-env";

// Brings the test database up to date once per run. Skipped when
// TEST_DATABASE_URL is unset, as in CI.
export default async function globalSetup() {
  const testDatabaseUrl = resolveTestDatabaseUrl();

  if (!testDatabaseUrl) {
    return;
  }

  const client = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} });

  try {
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}
