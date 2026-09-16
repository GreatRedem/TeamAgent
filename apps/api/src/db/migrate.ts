import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config } from "../config.js";

const { Client } = pg;

async function main(): Promise<void> {
  const client = new Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: "src/db/migrations" });
    console.log("migrations applied");
  } finally {
    await client.end();
  }
}

void main();
