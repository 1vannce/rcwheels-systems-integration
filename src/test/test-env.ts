import { existsSync, readFileSync } from "node:fs";

import { parse } from "dotenv";

/**
 * Returns TEST_DATABASE_URL from the environment, or from .env.local when it is
 * not set there. Only this one key is read, so the hosted DATABASE_URL in
 * .env.local never reaches a test run.
 */
export function resolveTestDatabaseUrl(): string | undefined {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  if (!existsSync(".env.local")) {
    return undefined;
  }

  return parse(readFileSync(".env.local")).TEST_DATABASE_URL || undefined;
}
