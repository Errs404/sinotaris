import assert from "node:assert/strict";
import { test } from "node:test";
import { validateTestDatabaseEnvironment } from "./databaseGuard";

const localTestUrl = "postgresql://test_user:test_password@localhost:5432/sinotaris_test";

test("guard rejects a missing TEST_DATABASE_URL", () => {
  assert.throws(() => validateTestDatabaseEnvironment({}), /TEST_DATABASE_URL is required/);
});

test("guard rejects production", () => {
  assert.throws(
    () => validateTestDatabaseEnvironment({ TEST_DATABASE_URL: localTestUrl, NODE_ENV: "production" }),
    /NODE_ENV must not be production/,
  );
});

test("guard rejects the same database across loopback aliases and credential differences", () => {
  assert.throws(() => validateTestDatabaseEnvironment({
    TEST_DATABASE_URL: localTestUrl,
    DATABASE_URL: "postgres://different:credentials@127.0.0.1/sinotaris_test",
  }), /must differ from DATABASE_URL/);
  assert.throws(() => validateTestDatabaseEnvironment({
    TEST_DATABASE_URL: "postgresql://one:secret@[::1]:5432/sinotaris_test",
    DATABASE_URL: "postgresql://two:other@localhost/sinotaris_test",
  }), /must differ from DATABASE_URL/);
});

test("guard rejects schema-only test isolation and non-public schemas", () => {
  assert.throws(
    () => validateTestDatabaseEnvironment({
      TEST_DATABASE_URL: "postgresql://user:secret@localhost:5432/sinotaris?schema=sinotaris_test",
    }),
    /public schema/,
  );
  assert.throws(
    () => validateTestDatabaseEnvironment({
      TEST_DATABASE_URL: "postgresql://user:secret@localhost:5432/sinotaris_test?schema=test_schema",
    }),
    /public schema/,
  );
});

test("guard rejects query-parameter target bypasses", () => {
  for (const parameter of ["host", "hostaddr", "port", "user", "password", "dbname", "database", "service", "servicefile", "options", "sslkey", "sslcert", "sslrootcert", "target_session_attrs"]) {
    assert.throws(
      () => validateTestDatabaseEnvironment({
        TEST_DATABASE_URL: `${localTestUrl}?${parameter}=bypass`,
      }),
      /unsupported connection query parameter/,
    );
  }
});

test("guard requires exact target-bound consent for a remote database", () => {
  const remoteUrl = "postgresql://user:secret@db.example.test:5440/sinotaris_test";
  assert.throws(
    () => validateTestDatabaseEnvironment({ TEST_DATABASE_URL: remoteUrl }),
    /exactly match the remote target fingerprint/,
  );
  assert.throws(
    () => validateTestDatabaseEnvironment({
      TEST_DATABASE_URL: remoteUrl,
      ALLOW_REMOTE_TEST_DATABASE: "db.example.test:5432/sinotaris_test",
    }),
    /exactly match the remote target fingerprint/,
  );
  const validated = validateTestDatabaseEnvironment({
    TEST_DATABASE_URL: remoteUrl,
    ALLOW_REMOTE_TEST_DATABASE: "db.example.test:5440/sinotaris_test",
  });
  assert.equal(validated.fingerprint, "db.example.test:5440/sinotaris_test");
});

test("guard accepts a dedicated local sinotaris_test database", () => {
  const validated = validateTestDatabaseEnvironment({
    TEST_DATABASE_URL: `${localTestUrl}?schema=public`,
    DATABASE_URL: "postgresql://dev:secret@localhost:5432/sinotaris",
  });
  assert.equal(validated.database, "sinotaris_test");
  assert.equal(validated.schema, "public");
  assert.equal(validated.hostname, "loopback");
  assert.equal(validated.isLocal, true);
});
