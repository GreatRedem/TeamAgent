import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { roles, teamMembers, teams, users } from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";
import { badRequest, conflict, notFound } from "../../lib/http.js";
import { writeAudit } from "../audit/log.js";

export interface TeamMeta {
  ip?: string | null;
  userAgent?: string | null;
}

async function systemRoleId(database: AnyDb, name: string): Promise<string> {
  const systemRows = await database.select().from(roles);
  const role = systemRows.find((r) => r.name === name && r.teamId === null);
  if (role === undefined) {
    throw badRequest("ROLE_NOT_SEEDED", `System role ${name} is not seeded.`);
  }
  return role.id;
}

/** Creates the team and seats the creator as its owner-member. */
export async function createTeam(
  database: AnyDb,
  input: { name: string; ownerId: string } & TeamMeta,
): Promise<{ id: string; name: string }> {
  if (input.name.trim().length === 0) {
    throw badRequest("INVALID_INPUT", "Team name must not be empty.");
  }
  const id = randomUUID();
  await database.insert(teams).values({ id, name: input.name.trim(), ownerId: input.ownerId });
  await database.insert(teamMembers).values({
    id: randomUUID(),
    teamId: id,
    userId: input.ownerId,
    roleId: await systemRoleId(database, "owner"),
  });
  await writeAudit(database, {
    teamId: id,
    actorType: "user",
    actorId: input.ownerId,
    action: "team.create",
    resourceType: "team",
    resourceId: id,
    outcome: "allowed",
    metadata: { name: input.name.trim() },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { id, name: input.name.trim() };
}

export async function getTeam(
  database: AnyDb,
  teamId: string,
): Promise<{ id: string; name: string; ownerId: string; status: string } | null> {
  const rows = await database.select().from(teams).where(eq(teams.id, teamId));
  const team = rows[0];
  if (team === undefined) return null;
  return { id: team.id, name: team.name, ownerId: team.ownerId, status: team.status };
}

export async function updateTeam(
  database: AnyDb,
  input: { teamId: string; name?: string; status?: string; actorId: string } & TeamMeta,
): Promise<void> {
  const team = await getTeam(database, input.teamId);
  if (team === null) throw notFound("Team");
  const patch: { name?: string; status?: string } = {};
  if (input.name !== undefined) {
    if (input.name.trim().length === 0)
      throw badRequest("INVALID_INPUT", "Team name must not be empty.");
    patch.name = input.name.trim();
  }
  if (input.status !== undefined) {
    if (input.status !== "active" && input.status !== "archived") {
      throw badRequest("INVALID_INPUT", "Status must be active or archived.");
    }
    patch.status = input.status;
  }
  if (Object.keys(patch).length > 0) {
    await database.update(teams).set(patch).where(eq(teams.id, input.teamId));
  }
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: "user",
    actorId: input.actorId,
    action: "team.update",
    resourceType: "team",
    resourceId: input.teamId,
    outcome: "allowed",
    metadata: patch,
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function listMembers(
  database: AnyDb,
  teamId: string,
): Promise<{ userId: string; roleId: string; roleName: string }[]> {
  const rows = await database
    .select({ userId: teamMembers.userId, roleId: teamMembers.roleId, roleName: roles.name })
    .from(teamMembers)
    .innerJoin(roles, eq(teamMembers.roleId, roles.id))
    .where(eq(teamMembers.teamId, teamId));
  return rows;
}

async function resolveRole(
  database: AnyDb,
  teamId: string,
  roleId: string,
): Promise<{ id: string; name: string }> {
  const rows = await database.select().from(roles).where(eq(roles.id, roleId));
  const role = rows[0];
  // A team may use a system role or one of its own — never another team's.
  if (role === undefined || (role.teamId !== null && role.teamId !== teamId)) {
    throw badRequest("UNKNOWN_ROLE", "The role does not exist in this team.");
  }
  return { id: role.id, name: role.name };
}

/** role_id is a row reference, never a free-text name (docs/15-api.md). */
export async function addMember(
  database: AnyDb,
  input: { teamId: string; userId: string; roleId: string; actorId: string } & TeamMeta,
): Promise<void> {
  const team = await getTeam(database, input.teamId);
  if (team === null) throw notFound("Team");
  const userRows = await database.select().from(users).where(eq(users.id, input.userId));
  if (userRows.length === 0) throw badRequest("UNKNOWN_USER", "The user does not exist.");
  const role = await resolveRole(database, input.teamId, input.roleId);
  const existing = await database
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)));
  if (existing.length > 0) {
    throw conflict("MEMBER_EXISTS", "The user is already a member of this team.");
  }
  await database.insert(teamMembers).values({
    id: randomUUID(),
    teamId: input.teamId,
    userId: input.userId,
    roleId: role.id,
  });
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: "user",
    actorId: input.actorId,
    action: "team.member.add",
    resourceType: "team_member",
    resourceId: input.userId,
    outcome: "allowed",
    metadata: { role: role.name },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function removeMember(
  database: AnyDb,
  input: { teamId: string; userId: string; actorId: string } & TeamMeta,
): Promise<void> {
  const team = await getTeam(database, input.teamId);
  if (team === null) throw notFound("Team");
  if (team.ownerId === input.userId) {
    throw badRequest(
      "OWNER_REMOVAL_REQUIRES_TRANSFER",
      "The team owner cannot be removed. Transfer ownership first.",
    );
  }
  const existing = await database
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)));
  if (existing.length === 0) throw notFound("Member");
  await database
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)));
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: "user",
    actorId: input.actorId,
    action: "team.member.remove",
    resourceType: "team_member",
    resourceId: input.userId,
    outcome: "allowed",
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function updateMemberRole(
  database: AnyDb,
  input: { teamId: string; userId: string; roleId: string; actorId: string } & TeamMeta,
): Promise<void> {
  const team = await getTeam(database, input.teamId);
  if (team === null) throw notFound("Team");
  const role = await resolveRole(database, input.teamId, input.roleId);
  const existing = await database
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)));
  if (existing.length === 0) throw notFound("Member");
  await database
    .update(teamMembers)
    .set({ roleId: role.id })
    .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)));
  await writeAudit(database, {
    teamId: input.teamId,
    actorType: "user",
    actorId: input.actorId,
    action: "team.member.role.change",
    resourceType: "team_member",
    resourceId: input.userId,
    outcome: "allowed",
    metadata: { role: role.name },
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}
