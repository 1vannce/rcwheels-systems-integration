import { resolveTestDatabaseUrl } from "./test-env";

const testDatabaseUrl = resolveTestDatabaseUrl();

if (testDatabaseUrl) {
  process.env.TEST_DATABASE_URL = testDatabaseUrl;
} else {
  delete process.env.TEST_DATABASE_URL;
}

// Tests must never reach the hosted database. Without a test database the
// client gets an address nothing listens on; DB-backed tests skip themselves.
process.env.DATABASE_URL =
  testDatabaseUrl ?? "postgresql://unused:unused@127.0.0.1:1/unused";
