import type { PoolConfig } from "pg";

const CONNECTION_STRING_SSL_KEYS = [
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
];

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function parseDatabaseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function readBooleanEnv(value: string | undefined): boolean | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function hasConnectionStringSslConfig(parsedUrl: URL | null): boolean {
  if (!parsedUrl) {
    return false;
  }

  return CONNECTION_STRING_SSL_KEYS.some((key) =>
    parsedUrl.searchParams.has(key),
  );
}

function shouldInferManagedPostgresSsl(parsedUrl: URL | null): boolean {
  if (!parsedUrl) {
    return false;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    LOCAL_DATABASE_HOSTS.has(hostname) ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return false;
  }

  return (
    hostname.endsWith(".supabase.co") ||
    hostname.endsWith(".supabase.com") ||
    Boolean(process.env.SUPABASE_URL?.trim())
  );
}

function getRequestedSslMode(databaseUrl: string): string | null {
  const parsedUrl = parseDatabaseUrl(databaseUrl);
  const explicitUrlMode = parsedUrl?.searchParams.get("sslmode")?.trim().toLowerCase();

  if (explicitUrlMode) {
    return explicitUrlMode;
  }

  const explicitEnvMode =
    process.env.DATABASE_SSL_MODE?.trim().toLowerCase() ||
    process.env.PGSSLMODE?.trim().toLowerCase();

  if (explicitEnvMode) {
    return explicitEnvMode;
  }

  const explicitBoolean = readBooleanEnv(process.env.DATABASE_SSL);
  if (explicitBoolean === true) {
    return "require";
  }

  if (explicitBoolean === false) {
    return "disable";
  }

  return shouldInferManagedPostgresSsl(parsedUrl) ? "require" : null;
}

export function normalizeDatabaseUrlForPrisma(databaseUrl: string): string {
  const parsedUrl = parseDatabaseUrl(databaseUrl);
  if (!parsedUrl || hasConnectionStringSslConfig(parsedUrl)) {
    return databaseUrl;
  }

  const sslMode = getRequestedSslMode(databaseUrl);
  if (!sslMode || sslMode === "disable") {
    return databaseUrl;
  }

  parsedUrl.searchParams.set("sslmode", sslMode);
  return parsedUrl.toString();
}

export function createPrismaPgConfig(databaseUrl: string): string | PoolConfig {
  const parsedUrl = parseDatabaseUrl(databaseUrl);
  if (!parsedUrl || hasConnectionStringSslConfig(parsedUrl)) {
    return databaseUrl;
  }

  const sslMode = getRequestedSslMode(databaseUrl);
  if (!sslMode || sslMode === "disable") {
    return databaseUrl;
  }

  const shouldVerifyCertificates =
    sslMode === "verify-ca" || sslMode === "verify-full";
  const rejectUnauthorizedOverride = readBooleanEnv(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
  );
  const rejectUnauthorized =
    rejectUnauthorizedOverride ?? shouldVerifyCertificates;

  return {
    connectionString: databaseUrl,
    ssl: rejectUnauthorized
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  };
}
