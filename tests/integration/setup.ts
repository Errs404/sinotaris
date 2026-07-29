import "dotenv/config";
import { validateTestDatabaseEnvironment } from "./databaseGuard";

export const validatedTestDatabase = validateTestDatabaseEnvironment(process.env);
process.env.DATABASE_URL = validatedTestDatabase.url;
