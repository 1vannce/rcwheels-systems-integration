import "server-only";
import postgres from "postgres";

const CONNECT_TIMEOUT_SECONDS = 5;

export type DatabasePingResult =
  | { connected: true; latencyMs: number }
  | { connected: false; reason: string };

/**
 * Runs `SELECT 1` against DATABASE_URL with a short-lived client, so it never
 * leaves a connection behind or interferes with the app's shared pool.
 */
export async function pingDatabase(): Promise<DatabasePingResult> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return { connected: false, reason: "DATABASE_URL is not set" };
  }

  const urlProblem = findConnectionStringProblem(connectionString);

  if (urlProblem) {
    return { connected: false, reason: urlProblem };
  }

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
  });
  const startedAt = performance.now();

  try {
    await sql`select 1`;
    return {
      connected: true,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return { connected: false, reason: describeConnectionError(error) };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

/**
 * `new URL` silently misparses passwords containing characters such as `#`
 * or `/`. Comparing the parsed host with the raw host catches that case and
 * gives a fixable message instead of a confusing DNS error.
 */
function findConnectionStringProblem(connectionString: string): string | null {
  const schemeEnd = connectionString.indexOf("://");
  const at = connectionString.lastIndexOf("@");

  if (schemeEnd === -1 || at < schemeEnd) {
    return "DATABASE_URL must look like postgresql://user:password@host:port/database";
  }

  let url: URL;

  try {
    url = new URL(connectionString);
  } catch {
    return "DATABASE_URL is not a valid URL; percent-encode special characters in the password";
  }

  const rawHost = connectionString
    .slice(at + 1)
    .split("/")[0]
    .replace(/:\d+$/, "")
    .toLowerCase();

  if (!url.hostname || url.hostname !== rawHost) {
    return "DATABASE_URL is parsed incorrectly; percent-encode special characters in the password (for example # becomes %23)";
  }

  if (!url.username) {
    return "DATABASE_URL is missing the database user";
  }

  if (!url.password) {
    return "DATABASE_URL is missing the database password";
  }

  return null;
}

function describeConnectionError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const code =
    "code" in error && typeof error.code === "string" ? `${error.code}: ` : "";

  return `${code}${error.message}`;
}
