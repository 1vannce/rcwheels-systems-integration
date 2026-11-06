/**
 * Runs once when the Next.js server starts, before it accepts requests.
 * The database check is skipped on the edge runtime and during production
 * builds, where no database is expected to be reachable.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const { pingDatabase } = await import("./lib/db-ping");
  const result = await pingDatabase();

  if (result.connected) {
    console.log(`[DATABASE] connected in ${result.latencyMs} ms`);
  } else {
    console.error(`[DATABASE] not connected: ${result.reason}`);
  }
}
