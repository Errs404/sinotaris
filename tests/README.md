# Integration tests

These tests use a dedicated, already-migrated, disposable PostgreSQL database. They never create, drop, reset, or migrate a database automatically.

1. Create a separate database whose database name contains an explicit `test` token, for example `sinotaris_test`. Schema-only isolation is not accepted; tests require the database's `public` schema.
2. Apply the existing migrations to that database explicitly, for example in PowerShell:

   ```powershell
   $env:DATABASE_URL = "postgresql://USER:PASSWORD@localhost:5432/sinotaris_test"
   npx prisma migrate deploy
   ```

3. Run the tests with a separately named variable:

   ```powershell
   $env:TEST_DATABASE_URL = "postgresql://USER:PASSWORD@localhost:5432/sinotaris_test"
   npm run test:integration
   ```

The guard refuses missing or production configuration, a target equal to `DATABASE_URL` after canonical loopback/port/database comparison, a database pathname without an explicit `test` token, non-public schemas, and connection-routing query parameters. URL credentials are ignored when comparing effective targets and are never printed by the helper.

Local targets must use `localhost`, `127.0.0.1`, or `::1`. A deliberately remote disposable test database requires target-bound consent. Set `ALLOW_REMOTE_TEST_DATABASE` to the exact non-secret fingerprint `hostname:port/database`, using the effective port. For example:

```powershell
$env:TEST_DATABASE_URL = "postgresql://USER:PASSWORD@test-db.example.internal:5432/sinotaris_test"
$env:ALLOW_REMOTE_TEST_DATABASE = "test-db.example.internal:5432/sinotaris_test"
npm run test:integration
```

Before fixtures or writes, the test client verifies PostgreSQL reports the expected `current_database()` and `current_schema()` (`public`).

Fixtures and assertions run in transactions that are intentionally rolled back. Audit rows are never deleted during cleanup.

Guard-only unit tests do not connect to PostgreSQL:

```powershell
npm run test:integration:guard
```
