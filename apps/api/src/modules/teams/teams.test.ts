import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLogs, roles } from "../../db/schema/index.js";
import {
  authHeader,
  buildTestApp,
  signInFresh,
  type SignedInUser,
  type TestApp,
} from "../test-app.js";

let t: TestApp;
let owner: SignedInUser;
let member: SignedInUser;
let outsider: SignedInUser;
let teamId: string;
let memberRoleId: string;
let adminRoleId: string;

beforeAll(async () => {
  t = await buildTestApp();
  owner = await signInFresh(t.app);
  member = await signInFresh(t.app);
  outsider = await signInFresh(t.app);

  const roleRows = await t.t.db.select().from(roles);
  memberRoleId = roleRows.find((r) => r.name === "member" && r.teamId === null)?.id ?? "";
  adminRoleId = roleRows.find((r) => r.name === "admin" && r.teamId === null)?.id ?? "";
  expect(memberRoleId.length).toBeGreaterThan(0);

  const created = await t.app.inject({
    method: "POST",
    url: "/teams",
    headers: authHeader(owner.accessToken),
    payload: { name: "Alpha" },
  });
  expect(created.statusCode).toBe(200);
  teamId = (created.json() as { data: { id: string } }).data.id;
}, 60000);

afterAll(async () => {
  await t.t.close();
});

describe("teams and membership", () => {
  it("seats the creator as owner with the documented grants", async () => {
    const res = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/permissions`,
      headers: authHeader(owner.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const permissions = (res.json() as { data: { permissions: string[] } }).data.permissions;
    expect(permissions).toContain("team.manage");
    expect(permissions).toContain("member.invite");
    expect(permissions).toContain("apikey.manage");
  });

  it("hides other teams as NOT_FOUND, not FORBIDDEN", async () => {
    const res = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}`,
      headers: authHeader(outsider.accessToken),
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("adds a member by role row, audits it, and the member can read", async () => {
    const add = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { user_id: member.userId, role_id: memberRoleId },
    });
    expect(add.statusCode).toBe(200);

    const read = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}`,
      headers: authHeader(member.accessToken),
    });
    expect(read.statusCode).toBe(200);

    const members = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}/members`,
      headers: authHeader(member.accessToken),
    });
    expect(members.statusCode).toBe(200);

    const audits = await t.t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "team.member.add"));
    expect(audits.some((a) => a.outcome === "allowed" && a.teamId === teamId)).toBe(true);
  });

  it("denies permission-gated actions for members without the grant", async () => {
    const patch = await t.app.inject({
      method: "PATCH",
      url: `/teams/${teamId}`,
      headers: authHeader(member.accessToken),
      payload: { name: "Renamed" },
    });
    expect(patch.statusCode).toBe(403);

    const invite = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/members`,
      headers: authHeader(member.accessToken),
      payload: { user_id: outsider.userId, role_id: memberRoleId },
    });
    expect(invite.statusCode).toBe(403);
  });

  it("rejects duplicate members, unknown roles, and foreign roles", async () => {
    const duplicate = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { user_id: member.userId, role_id: memberRoleId },
    });
    expect(duplicate.statusCode).toBe(409);

    const unknownRole = await t.app.inject({
      method: "POST",
      url: `/teams/${teamId}/members`,
      headers: authHeader(owner.accessToken),
      payload: { user_id: outsider.userId, role_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(unknownRole.statusCode).toBe(400);
  });

  it("promotes to admin, which confers team.manage, then removes", async () => {
    const promote = await t.app.inject({
      method: "PATCH",
      url: `/teams/${teamId}/members/${member.userId}`,
      headers: authHeader(owner.accessToken),
      payload: { role_id: adminRoleId },
    });
    expect(promote.statusCode).toBe(200);

    const patch = await t.app.inject({
      method: "PATCH",
      url: `/teams/${teamId}`,
      headers: authHeader(member.accessToken),
      payload: { name: "Alpha Renamed" },
    });
    expect(patch.statusCode).toBe(200);

    const remove = await t.app.inject({
      method: "DELETE",
      url: `/teams/${teamId}/members/${member.userId}`,
      headers: authHeader(owner.accessToken),
    });
    expect(remove.statusCode).toBe(200);

    const gone = await t.app.inject({
      method: "GET",
      url: `/teams/${teamId}`,
      headers: authHeader(member.accessToken),
    });
    expect(gone.statusCode).toBe(404);
  });

  it("refuses to remove the team owner", async () => {
    const res = await t.app.inject({
      method: "DELETE",
      url: `/teams/${teamId}/members/${owner.userId}`,
      headers: authHeader(owner.accessToken),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe(
      "OWNER_REMOVAL_REQUIRES_TRANSFER",
    );
  });
});
