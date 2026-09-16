import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { pool } from "./pool.js";
import * as schema from "./schema/index.js";

export const db = drizzle(pool, { schema });

export type Db = NodePgDatabase<typeof schema>;

/** Either production driver or the PGlite test driver. */
export type AnyDb = Db | PgliteDatabase<typeof schema>;
