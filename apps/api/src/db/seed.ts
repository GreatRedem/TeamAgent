import { randomUUID } from "node:crypto";
import { permissions, rolePermissions, roles } from "./schema/index.js";
import type { AnyDb } from "./db.js";

interface PermissionSeed {
  name: string;
  riskTier: "read_only" | "reply" | "write" | "admin";
  appliesTo: "user" | "agent" | "both";
  description: string;
}

/**
 * The complete permission catalogue from docs/07-permission.md — the single
 * source of truth for the permission vocabulary. Tests seed from this same
 * path so the suite never passes against a model production does not have.
 */
export const PERMISSION_CATALOGUE: PermissionSeed[] = [
  {
    name: "team.view",
    riskTier: "read_only",
    appliesTo: "both",
    description: "View team profile and membership",
  },
  {
    name: "team.manage",
    riskTier: "admin",
    appliesTo: "user",
    description: "Change team settings, limits, and status",
  },
  {
    name: "member.invite",
    riskTier: "admin",
    appliesTo: "user",
    description: "Invite a user into the team",
  },
  {
    name: "member.remove",
    riskTier: "admin",
    appliesTo: "user",
    description: "Remove a member from the team",
  },
  {
    name: "agent.use",
    riskTier: "read_only",
    appliesTo: "both",
    description: "Start a run on an existing agent",
  },
  { name: "agent.create", riskTier: "admin", appliesTo: "user", description: "Create an agent" },
  {
    name: "agent.edit",
    riskTier: "admin",
    appliesTo: "user",
    description: "Change agent prompt, model, settings, or grants",
  },
  {
    name: "agent.delete",
    riskTier: "admin",
    appliesTo: "user",
    description: "Archive or delete an agent",
  },
  {
    name: "model.view",
    riskTier: "read_only",
    appliesTo: "both",
    description: "List models and read capability metadata",
  },
  {
    name: "model.use",
    riskTier: "read_only",
    appliesTo: "both",
    description: "Invoke a model through the gateway",
  },
  {
    name: "model.manage",
    riskTier: "admin",
    appliesTo: "user",
    description: "Register or disable model definitions",
  },
  {
    name: "source.read",
    riskTier: "read_only",
    appliesTo: "both",
    description: "Read source metadata and inbound events",
  },
  {
    name: "source.write",
    riskTier: "write",
    appliesTo: "both",
    description: "Emit output through a source connection",
  },
  {
    name: "source.connect",
    riskTier: "admin",
    appliesTo: "user",
    description: "Authorize a new source connection",
  },
  {
    name: "source.disconnect",
    riskTier: "admin",
    appliesTo: "user",
    description: "Revoke a source connection",
  },
  {
    name: "message.read",
    riskTier: "read_only",
    appliesTo: "both",
    description: "Read messages on a permitted connection",
  },
  {
    name: "message.reply",
    riskTier: "reply",
    appliesTo: "both",
    description: "Reply on the conversation the request arrived on",
  },
  {
    name: "message.send",
    riskTier: "write",
    appliesTo: "both",
    description: "Send to a destination other than the origin",
  },
  {
    name: "file.download",
    riskTier: "read_only",
    appliesTo: "both",
    description: "Read a stored file",
  },
  { name: "file.upload", riskTier: "write", appliesTo: "both", description: "Store a new file" },
  {
    name: "file.delete",
    riskTier: "write",
    appliesTo: "both",
    description: "Delete a stored file",
  },
  {
    name: "knowledge.read",
    riskTier: "read_only",
    appliesTo: "both",
    description: "Retrieve from permitted knowledge bases",
  },
  {
    name: "knowledge.write",
    riskTier: "write",
    appliesTo: "both",
    description: "Create or modify knowledge items",
  },
  {
    name: "workflow.view",
    riskTier: "read_only",
    appliesTo: "both",
    description: "View workflow definitions and run history",
  },
  {
    name: "workflow.run",
    riskTier: "write",
    appliesTo: "both",
    description: "Trigger a workflow execution",
  },
  {
    name: "workflow.create",
    riskTier: "admin",
    appliesTo: "user",
    description: "Create a workflow",
  },
  {
    name: "workflow.edit",
    riskTier: "admin",
    appliesTo: "user",
    description: "Publish a new workflow version",
  },
  {
    name: "workflow.delete",
    riskTier: "admin",
    appliesTo: "user",
    description: "Archive or delete a workflow",
  },
  {
    name: "tool.execute",
    riskTier: "read_only",
    appliesTo: "both",
    description: "Invoke a granted tool, subject to that tool risk_tier",
  },
  {
    name: "tool.manage",
    riskTier: "admin",
    appliesTo: "user",
    description: "Register or disable tool definitions",
  },
  { name: "web.search", riskTier: "read_only", appliesTo: "both", description: "Search the web" },
  {
    name: "browser.read",
    riskTier: "read_only",
    appliesTo: "both",
    description: "Fetch and read a web page",
  },
  {
    name: "database.read",
    riskTier: "read_only",
    appliesTo: "both",
    description: "Run a named read-only query",
  },
  {
    name: "database.write",
    riskTier: "write",
    appliesTo: "both",
    description: "Run a named mutating query",
  },
  {
    name: "code.execute",
    riskTier: "write",
    appliesTo: "both",
    description: "Execute code in a sandbox",
  },
  {
    name: "image.generate",
    riskTier: "write",
    appliesTo: "both",
    description: "Generate an image",
  },
  { name: "video.generate", riskTier: "write", appliesTo: "both", description: "Generate a video" },
  {
    name: "email.send",
    riskTier: "write",
    appliesTo: "both",
    description: "Send an outbound email",
  },
  {
    name: "telegram.send",
    riskTier: "write",
    appliesTo: "both",
    description: "Send a Telegram message",
  },
  {
    name: "discord.send",
    riskTier: "write",
    appliesTo: "both",
    description: "Send a Discord message",
  },
  {
    name: "user.profile.read",
    riskTier: "read_only",
    appliesTo: "both",
    description: "Read a team member profile",
  },
  {
    name: "settings.view",
    riskTier: "read_only",
    appliesTo: "user",
    description: "View team settings",
  },
  {
    name: "settings.manage",
    riskTier: "admin",
    appliesTo: "user",
    description: "Change team settings",
  },
  {
    name: "apikey.manage",
    riskTier: "admin",
    appliesTo: "user",
    description: "Issue, list, and revoke team API keys",
  },
  {
    name: "billing.view",
    riskTier: "read_only",
    appliesTo: "user",
    description: "View billing and usage",
  },
  {
    name: "billing.manage",
    riskTier: "admin",
    appliesTo: "user",
    description: "Change plan and payment details",
  },
  {
    name: "audit.view",
    riskTier: "read_only",
    appliesTo: "user",
    description: "Query the team audit log",
  },
  {
    name: "approval.decide",
    riskTier: "admin",
    appliesTo: "user",
    description: "Approve or reject a pending agent action",
  },
];

/** Five built-in system roles (docs/02-team.md), team_id NULL. */
export const SYSTEM_ROLES = ["owner", "admin", "manager", "member", "viewer"] as const;

function splitName(name: string): { resource: string; action: string } {
  const parts = name.split(".");
  const action = parts.pop() ?? name;
  return { resource: parts.join("."), action };
}

function permissionRow(p: PermissionSeed): typeof permissions.$inferInsert {
  const { resource, action } = splitName(p.name);
  return {
    id: randomUUID(),
    name: p.name,
    resource,
    action,
    riskTier: p.riskTier,
    appliesTo: p.appliesTo,
    description: p.description,
  };
}

/**
 * Idempotent: selects existing names first, inserts only what is missing.
 * Used by production startup and by tests against a fresh database alike.
 */
export async function seedPermissions(database: AnyDb): Promise<void> {
  const existing = await database.select({ name: permissions.name }).from(permissions);
  const have = new Set(existing.map((r) => r.name));
  const missing = PERMISSION_CATALOGUE.filter((p) => !have.has(p.name));
  if (missing.length > 0) {
    await database.insert(permissions).values(missing.map(permissionRow));
  }
}

export async function seedSystemRoles(database: AnyDb): Promise<void> {
  const existing = await database.select({ name: roles.name }).from(roles);
  const have = new Set(existing.map((r) => r.name));
  const missing = SYSTEM_ROLES.filter((n) => !have.has(n));
  if (missing.length > 0) {
    await database
      .insert(roles)
      .values(missing.map((name) => ({ id: randomUUID(), teamId: null, name })));
  }
}

type SystemRoleName = (typeof SYSTEM_ROLES)[number];

/**
 * Starting proposal from docs/07-permission.md (O/A/M/E/V columns) — not a
 * finished policy. The manager and member rows deserve deliberate review
 * before launch (member currently holds write-tier message.send and
 * workflow.run). Seeded as documented so permission checks resolve against
 * the real catalogue from the first run.
 */
const ROLE_PERMISSION_MAP: Record<string, SystemRoleName[]> = {
  "team.view": ["owner", "admin", "manager", "member", "viewer"],
  "team.manage": ["owner", "admin"],
  "member.invite": ["owner", "admin"],
  "member.remove": ["owner", "admin"],
  "agent.use": ["owner", "admin", "manager", "member"],
  "agent.create": ["owner", "admin", "manager"],
  "agent.edit": ["owner", "admin", "manager"],
  "agent.delete": ["owner", "admin", "manager"],
  "model.view": ["owner", "admin", "manager", "member", "viewer"],
  "model.use": ["owner", "admin", "manager", "member"],
  "model.manage": ["owner", "admin"],
  "source.read": ["owner", "admin", "manager", "member", "viewer"],
  "source.write": ["owner", "admin", "manager"],
  "source.connect": ["owner", "admin"],
  "source.disconnect": ["owner", "admin"],
  "message.read": ["owner", "admin", "manager", "member", "viewer"],
  "message.reply": ["owner", "admin", "manager", "member"],
  "message.send": ["owner", "admin", "manager", "member"],
  "file.download": ["owner", "admin", "manager", "member", "viewer"],
  "file.upload": ["owner", "admin", "manager", "member"],
  "file.delete": ["owner", "admin", "manager"],
  "knowledge.read": ["owner", "admin", "manager", "member", "viewer"],
  "knowledge.write": ["owner", "admin", "manager"],
  "workflow.view": ["owner", "admin", "manager", "member", "viewer"],
  "workflow.run": ["owner", "admin", "manager", "member"],
  "workflow.create": ["owner", "admin", "manager"],
  "workflow.edit": ["owner", "admin", "manager"],
  "workflow.delete": ["owner", "admin", "manager"],
  "tool.execute": ["owner", "admin", "manager", "member"],
  "tool.manage": ["owner", "admin"],
  "web.search": ["owner", "admin"],
  "browser.read": ["owner", "admin"],
  "database.read": ["owner", "admin"],
  "database.write": ["owner", "admin"],
  "code.execute": ["owner", "admin"],
  "image.generate": ["owner", "admin"],
  "video.generate": ["owner", "admin"],
  "email.send": ["owner", "admin"],
  "telegram.send": ["owner", "admin"],
  "discord.send": ["owner", "admin"],
  "user.profile.read": ["owner", "admin", "manager", "member", "viewer"],
  "settings.view": ["owner", "admin", "manager"],
  "settings.manage": ["owner", "admin"],
  "apikey.manage": ["owner", "admin"],
  "billing.view": ["owner", "admin"],
  "billing.manage": ["owner"],
  "audit.view": ["owner", "admin", "manager"],
  "approval.decide": ["owner", "admin", "manager"],
};

export async function seedRolePermissions(database: AnyDb): Promise<void> {
  const roleRows = await database.select().from(roles);
  const roleIdByName = new Map(
    roleRows.filter((r) => r.teamId === null).map((r) => [r.name, r.id]),
  );
  const permissionRows = await database.select().from(permissions);
  const permissionIdByName = new Map(permissionRows.map((p) => [p.name, p.id]));
  const existing = await database.select().from(rolePermissions);
  const have = new Set(existing.map((r) => `${r.roleId}:${r.permissionId}`));
  const missing: { id: string; roleId: string; permissionId: string }[] = [];
  for (const [permissionName, roleNames] of Object.entries(ROLE_PERMISSION_MAP)) {
    const permissionId = permissionIdByName.get(permissionName);
    if (permissionId === undefined) continue;
    for (const roleName of roleNames) {
      const roleId = roleIdByName.get(roleName);
      if (roleId === undefined) continue;
      if (!have.has(`${roleId}:${permissionId}`)) {
        missing.push({ id: randomUUID(), roleId, permissionId });
      }
    }
  }
  if (missing.length > 0) {
    await database.insert(rolePermissions).values(missing);
  }
}
