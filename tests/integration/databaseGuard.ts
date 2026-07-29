export interface TestDatabaseEnvironment {
  TEST_DATABASE_URL?: string;
  DATABASE_URL?: string;
  NODE_ENV?: string;
  ALLOW_REMOTE_TEST_DATABASE?: string;
}

export interface ValidatedTestDatabase {
  url: string;
  hostname: string;
  port: string;
  database: string;
  schema: "public";
  fingerprint: string;
  isLocal: boolean;
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const allowedQueryParameters = new Set(["schema"]);
const targetRoutingParameters = new Set([
  "host", "hostaddr", "port", "user", "password", "dbname", "database", "service", "servicefile",
  "options", "sslkey", "sslcert", "sslrootcert", "target_session_attrs", "load_balance_hosts",
]);

function parsePostgresUrl(raw: string, variableName: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Integration tests refused: ${variableName} is not a valid URL.`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`Integration tests refused: ${variableName} must use PostgreSQL.`);
  }
  return parsed;
}

function canonicalHostname(hostname: string): string {
  const normalized = hostname.toLowerCase();
  return loopbackHosts.has(normalized) ? "loopback" : normalized;
}

function consentHostname(hostname: string): string {
  const normalized = hostname.toLowerCase();
  return normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized;
}

function databaseName(parsed: URL): string {
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ""));
  if (!database || database.includes("/")) {
    throw new Error("Integration tests refused: TEST_DATABASE_URL must name one dedicated database.");
  }
  return database;
}

function assertSafeTestQuery(parsed: URL) {
  for (const key of parsed.searchParams.keys()) {
    if (!allowedQueryParameters.has(key.toLowerCase())) {
      throw new Error("Integration tests refused: TEST_DATABASE_URL contains an unsupported connection query parameter.");
    }
  }
  const schemas = parsed.searchParams.getAll("schema");
  if (schemas.length > 1 || (schemas.length === 1 && schemas[0] !== "public")) {
    throw new Error("Integration tests refused: TEST_DATABASE_URL must use the public schema.");
  }
}

function assertComparableNormalUrl(parsed: URL) {
  for (const key of parsed.searchParams.keys()) {
    if (targetRoutingParameters.has(key.toLowerCase())) {
      throw new Error("Integration tests refused: DATABASE_URL contains a connection-routing query parameter and cannot be compared safely.");
    }
  }
}

function canonicalTarget(parsed: URL, testUrl: boolean) {
  if (testUrl) assertSafeTestQuery(parsed);
  else assertComparableNormalUrl(parsed);
  const hostname = canonicalHostname(parsed.hostname);
  const port = parsed.port || "5432";
  const database = testUrl
    ? databaseName(parsed)
    : decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ""));
  return { hostname, port, database };
}

function fingerprintFor(hostname: string, port: string, database: string): string {
  const displayHost = hostname.includes(":") ? `[${hostname}]` : hostname;
  return `${displayHost}:${port}/${database}`;
}

export function validateTestDatabaseEnvironment(env: TestDatabaseEnvironment): ValidatedTestDatabase {
  const testUrl = env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("Integration tests refused: TEST_DATABASE_URL is required.");
  if (env.NODE_ENV === "production") {
    throw new Error("Integration tests refused: NODE_ENV must not be production.");
  }

  const parsed = parsePostgresUrl(testUrl, "TEST_DATABASE_URL");
  const target = canonicalTarget(parsed, true);
  if (!/(^|[_-])test([_-]|$)/i.test(target.database)) {
    throw new Error("Integration tests refused: the database name must contain an explicit 'test' marker.");
  }

  if (env.DATABASE_URL) {
    const normal = canonicalTarget(parsePostgresUrl(env.DATABASE_URL, "DATABASE_URL"), false);
    if (normal.hostname === target.hostname && normal.port === target.port && normal.database === target.database) {
      throw new Error("Integration tests refused: TEST_DATABASE_URL must differ from DATABASE_URL.");
    }
  }

  const isLocal = target.hostname === "loopback";
  const fingerprintHost = isLocal ? target.hostname : consentHostname(parsed.hostname);
  const fingerprint = fingerprintFor(fingerprintHost, target.port, target.database);
  if (!isLocal && env.ALLOW_REMOTE_TEST_DATABASE !== fingerprint) {
    throw new Error(
      "Integration tests refused: ALLOW_REMOTE_TEST_DATABASE must exactly match the remote target fingerprint.",
    );
  }

  return {
    url: testUrl,
    hostname: target.hostname,
    port: target.port,
    database: target.database,
    schema: "public",
    fingerprint,
    isLocal,
  };
}
