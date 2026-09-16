import { randomUUID } from "node:crypto";
import { permissions, roles } from "./schema/index.js";
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
