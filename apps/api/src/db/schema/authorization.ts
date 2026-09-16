import { pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./identity.js";
import { teams } from "./tenancy.js";

/**
 * Global permission catalogue, seeded from docs/07-permission.md.
 *
 * risk_tier drives the C2 capability matrix; applies_to enforces the
 * human/agent separation (R3 removes admin/user-only grants from agents).
 */
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  riskTier: text("risk_tier").notNull(),
  appliesTo: text("applies_to").notNull(),
  description: text("description"),
});

/**
 * Team-scoped roles; team_id NULL marks the built-in system roles.
 * R1: system role names are unique via partial unique index (a plain
 * UNIQUE does not dedupe NULLs).
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("roles_team_name_unique").on(table.teamId, table.name),
    uniqueIndex("roles_system_name_unique")
      .on(table.name)
      .where(sql`${table.teamId} IS NULL`),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("role_permissions_unique").on(table.roleId, table.permissionId)],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("team_members_team_user_unique").on(table.teamId, table.userId)],
);

/**
 * Direct grants outside roles: resource-scoped overrides, explicit denies,
 * temporary or delegated access with expiry. Unscoped grants are real NULLs;
 * uniqueness uses NULLS NOT DISTINCT so the same unscoped grant cannot be
 * inserted twice (PostgreSQL 15+).
 */
export const userPermissionGrants = pgTable(
  "user_permission_grants",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "restrict" }),
    scopeType: text("scope_type"),
    scopeId: uuid("scope_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("user_permission_grants_unique")
      .on(table.teamId, table.userId, table.permissionId, table.scopeType, table.scopeId)
      .nullsNotDistinct(),
  ],
);
