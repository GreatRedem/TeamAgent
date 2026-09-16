---
name: auth
description: "Use when implementing or reviewing NuraAI wallet authentication, SIWE/EIP-4361 parsing, EIP-1271 verification, JWTs, refresh rotation, nonce handling, or session revocation."
---

# NuraAI Wallet Authentication

Follow `docs/20-authentication.md` and the auth endpoints in `docs/15-api.md`.

## Non-negotiable checks

- Parse SIWE with a real parser; never extract fields with permissive regexes.
- Compare domain and URI with exact equality.
- Verify chain ID, issued-at, expiration, and normalized address.
- Consume a nonce atomically and require exactly one affected row before continuing.
- Support EOA verification and EIP-1271 with a timeout and fail-closed behavior.
- Keep permissions and roles out of JWT claims.
- Check `token_version` on authenticated requests.
- Hash opaque refresh tokens, rotate them on every use, and revoke the family on reuse.
- Audit failed authentication attempts without recording signatures, tokens, or secrets.

## Tests

Cover domain suffix attacks, nonce races, expiry, wrong chain, wrong signer, EIP-1271 failure, refresh replay, stale token version, and absence of permission claims.
