import Fastify, { type FastifyInstance } from "fastify";
import { createSiweMessage } from "viem/siwe";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { createTestDb, type TestDb } from "../db/harness.js";
import { seedPermissions, seedRolePermissions, seedSystemRoles } from "../db/seed.js";
import { registerApi } from "./api.js";
import { testDeps, type ApiDeps } from "./deps.js";

export interface TestApp {
  app: FastifyInstance;
  t: TestDb;
  deps: ApiDeps;
}

export async function buildTestApp(overrides: Partial<ApiDeps> = {}): Promise<TestApp> {
  const t = await createTestDb();
  await seedPermissions(t.db);
  await seedSystemRoles(t.db);
  await seedRolePermissions(t.db);
  const deps = testDeps(t.db, overrides);
  const app = Fastify();
  await registerApi(app, deps);
  return { app, t, deps };
}

export function newAccount(): PrivateKeyAccount {
  return privateKeyToAccount(generatePrivateKey());
}

export async function fetchNonce(app: FastifyInstance, address: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/auth/wallet/nonce", payload: { address } });
  if (res.statusCode !== 200) throw new Error(`nonce failed: ${res.body}`);
  return (res.json() as { data: { nonce: string } }).data.nonce;
}

export function siweMessage(input: {
  address: string;
  nonce: string;
  domain?: string;
  uri?: string;
  chainId?: number;
  issuedAt?: Date;
  expirationTime?: Date | null;
}): string {
  return createSiweMessage({
    domain: input.domain ?? "test.example.com",
    address: input.address as `0x${string}`,
    statement: "Sign in to NuraAI. This request will not trigger a transaction or cost any gas.",
    uri: input.uri ?? "https://test.example.com",
    version: "1",
    chainId: input.chainId ?? 1,
    nonce: input.nonce,
    issuedAt: input.issuedAt ?? new Date(),
    expirationTime:
      input.expirationTime === null
        ? undefined
        : (input.expirationTime ?? new Date(Date.now() + 5 * 60 * 1000)),
  });
}

export interface SignedInUser {
  account: PrivateKeyAccount;
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export async function signInFresh(app: FastifyInstance): Promise<SignedInUser> {
  const account = newAccount();
  const nonce = await fetchNonce(app, account.address);
  const message = siweMessage({ address: account.address, nonce });
  const signature = await account.signMessage({ message });
  const res = await app.inject({
    method: "POST",
    url: "/auth/wallet/verify",
    payload: { message, signature },
  });
  if (res.statusCode !== 200) throw new Error(`sign-in failed: ${res.body}`);
  const data = (
    res.json() as { data: { accessToken: string; refreshToken: string; user: { id: string } } }
  ).data;
  return {
    account,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    userId: data.user.id,
  };
}

export function authHeader(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
