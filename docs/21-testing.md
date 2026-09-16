# Testing Strategy

`docs/18-production-checklist.md` lists the test categories required before launch. This document is the design behind them: what to test, what the hard cases are, and where the usual instincts fail for this particular system.

## What makes this system unusual to test

Four properties shape the whole strategy:

1. **Most of the value is in negative tests.** `docs/17-threat-model.md` is a list of things that must *not* happen. A suite that only proves features work will pass while every security control is broken. The important assertions are of the form "attempt the forbidden thing, assert it fails, assert it was recorded."
2. **The system is nondeterministic at its core.** A language model is in the request path. This is manageable, but only if the deterministic parts are separated from it cleanly — see below.
3. **Every test runs against the production engine.** PostgreSQL only, per `docs/19-tech-stack.md`, using PGlite in-process. There is no second dialect and therefore no second matrix — but it also means the suite has no excuse for mocking the database, since a real one starts in milliseconds.
4. **Isolation bugs are invisible with one tenant.** A missing `team_id` predicate passes every test written against a single team. Fixtures must always contain at least two.

## Layers

| Layer | Scope | Database | Model provider | Speed |
|---|---|---|---|---|
| Unit | Pure functions: policy decisions, trust resolution, message parsing, prompt assembly | none | none | ms |
| Integration | Repositories, routes, workers | real (PGlite) | mocked | seconds |
| Contract | Source connectors against recorded provider fixtures | real | none | seconds |
| End-to-end | Critical journeys through the running stack | real | mocked | minutes |
| Evaluation | Model behaviour and prompt quality | real | **real** | slow, **not CI-gating** |

The last row is the one people get wrong. See *Evals are not tests*.

## The suites that are non-negotiable

These correspond one-to-one with claims made elsewhere in the docs. If a claim is worth writing down, it is worth a test that fails when it stops being true.

### 1. Invariants R1–R5

From `docs/14-database.md`. Each gets a test that attempts the forbidden write and asserts failure.

Four of the five are enforced by the database — partial unique indexes for R1 and R2, a trigger for R3, a CHECK for R4 — and that is a reason to test them, not a reason to skip them. **A trigger can be dropped by a later migration exactly as silently as a repository check can be refactored away**, and these tests are what turn that into a red build instead of a quiet loss of a security boundary. They are also the only thing verifying that the constraint was actually shipped in the migration rather than just written down here.

Write them against the real schema through the repository layer, so they exercise the path production uses.

```
R1: two system roles with the same name                       -> rejected
R2: two system tools with the same name                       -> rejected
R3: granting an admin-tier permission to an agent             -> rejected
R3: granting an applies_to='user' permission to an agent      -> rejected
R4: can_initiate = true with an empty allowed_destinations     -> rejected
R4: can_initiate = true, then emptying allowed_destinations    -> rejected
R5: current_version_id pointing at another workflow's version -> rejected
```

The second R4 case matters and is easy to miss: the dangerous state is reachable by **update** as well as by insert, and a CHECK covers both only if it is written on the table rather than validated once at creation.

### 2. The capability matrix (C2)

`docs/17-threat-model.md` C2 is a 3 × 4 decision table: three context trust levels against four risk tiers. **Test all twelve cells**, plus the conditional in the `user_input` × `write` cell.

This is a pure function — given trust level, tier, grants, and requester, produce allow / deny / approval-required. It needs no database, no model, and no I/O. It is the single most security-critical piece of logic in the system and it should be the fastest test in the suite.

Assert the reason too, not just the outcome. A deny for the wrong reason is a bug that will become a wrong allow after the next refactor.

### 3. Destination allowlists (C3)

```
proposed destination present in allowed_destinations   -> allowed
proposed destination absent                            -> denied, recorded
proposed destination differing by case or whitespace   -> denied  (no normalization rescue)
proposed destination as a near-match or substring      -> denied  (no fuzzy matching)
can_initiate = false, destination other than origin    -> denied
can_initiate = false, destination equal to origin      -> allowed
```

The "near-match" cases matter because the failure mode here is a well-meaning developer adding leniency to fix a support ticket. A test that asserts strictness is what stops that.

### 4. Tenant isolation

Every repository method gets the same shape of test: two teams, data in both, query as team A, assert nothing from team B is returned. Including error paths — a "not found" for another team's resource must be indistinguishable from a genuinely missing one, or the API becomes an existence oracle.

Worth automating structurally: a test that enumerates repository methods and fails on any that has no isolation test, so new methods cannot quietly skip it.

### 5. Wallet authentication (W1–W8)

From `docs/20-authentication.md`.

```
domain mismatch, including a subdomain suffix   -> rejected   (W2, highest value)
nonce reused                                    -> rejected   (W1)
nonce expired                                   -> rejected
nonce issued to a different address             -> rejected
two concurrent verifies, one nonce              -> exactly one succeeds  (W1 race)
chainId mismatch                                -> rejected   (W3)
signature by a different key                    -> rejected
EIP-1271 RPC timeout                            -> rejected   (W4, fail closed)
EIP-1271 returns a non-magic value              -> rejected
address differing only in case                  -> same identity, no duplicate user
refresh token replayed after rotation           -> family revoked  (W6)
token carrying a stale `ver`                    -> rejected
any token containing a permission claim         -> test fails
```

The concurrency test needs real parallel requests against a real database. An atomic-consume bug is invisible to a sequential test and is a full authentication bypass.

The last line is a structural assertion: decode tokens issued anywhere in the suite and fail if a permissions or roles claim ever appears. It prevents a future convenience commit from reintroducing the staleness problem `docs/20-authentication.md` exists to avoid.

### 6. Prompt injection containment

`docs/17-threat-model.md` requires an injection suite against every ingress path. The framing matters:

> **Do not test that injection fails. Test that successful injection is contained.**

The threat model's stated goal is containment, not prevention, and it assumes the model *will* be manipulated. A test asserting "the model refused" is testing the model's mood on a given day — it is flaky by construction and it will be deleted the first time it blocks a release.

The correct assertion is about the runtime:

```
given: untrusted content containing an injection payload
       reaching the context through <ingress>
assert: no write-tier tool call executed without an approval_request
assert: no egress to a destination outside allowed_destinations
assert: context_trust_level on the run is 'untrusted'
assert: every tool call attempt has a tool_calls row with a decision
```

These hold whether or not the model was fooled, which makes them deterministic and therefore CI-gating.

Maintain a corpus of payloads — direct instruction override, data exfiltration requests, markdown image side channels (T6), tool-output-borne instructions (T4), and tool-argument injection attempts (T10) — and run it through **every** ingress:

- interactive message
- inbound source webhook
- retrieved knowledge
- tool output
- **API key submission**, at both trust ceilings (T16)

The API key path is the one most likely to be forgotten, because it looks like an authenticated internal call rather than an ingress. It is the ingress a relay integration uses, and the corpus has to reach it.

### 7. Machine principal trust (T16)

A key-authenticated request passes every authorization check, so nothing in the authorization suite catches a trust escalation here. These assertions are the only thing that does.

```
new key with no trust_ceiling given       -> defaults to 'untrusted'
key with trust_ceiling = 'trusted'        -> rejected at issue time
trust_ceiling = 'user_input', no bound_user_id -> rejected
run started by a default key              -> context_trust_level is 'untrusted'
write-tier tool on that run               -> approval_required, not executed
run started by a user_input-bound key     -> context_trust_level is 'user_input'
write-tier tool on that run               -> resolves against the bound user grants, not the agent alone
inbound source content via a user_input key -> still 'untrusted' (ceiling is a cap, not an assignment)
tool result on any key-started run        -> still 'untrusted'
revoked key                               -> rejected immediately, not at expiry
```

The last three are the ones worth writing first. A ceiling that behaves like an assignment — raising the trust of content that arrived from a source or a tool — is the exact bug T16 exists to prevent, and it is invisible to every other suite.

Add a structural assertion alongside the token one in suite 5: **decode every principal built anywhere in the suite and fail if any key-authenticated principal is ever labelled `trusted`.** There is no legitimate path to that state, so an automated check is cheaper than reviewing for it.

### 8. Job queue semantics

The queue is built rather than installed (`docs/23-job-queue.md`), so its correctness is your responsibility and its failure modes are concurrency bugs that unit tests miss.

```
two workers, one available job     -> exactly one claims it   (real parallelism)
worker killed mid-job              -> reclaimed after the lease expires
reclaimed job                      -> handler is idempotent, no duplicate effect
attempts exceeding max_attempts    -> status becomes 'dead', not retried forever
run_at in the future               -> not claimed early
NOTIFY unavailable                 -> polling still delivers the job
trace_id                           -> worker span shares the enqueuer's trace
enqueue in a rolled-back txn       -> no job runs
```

The first and last are the ones that justify the design. The claim test needs genuine concurrent workers against a real database — a sequential test passes against a racy claim query. The rollback test proves the transactional-enqueue property that removing the broker bought.

### 9. Budget enforcement (C10)

Token spend, tool-call count, recursion depth, and wall-clock each get a test that exceeds the limit and asserts the run terminates. A runaway loop is both a cost incident and a denial-of-service vector, and the limits are the only thing standing between an injected agent and an unbounded bill.

### 10. Secret leakage (T9)

A structural test: run a representative workload with sentinel secret values loaded into every credential path, then scan every persisted artifact — `agent_runs`, `tool_calls`, `audit_logs`, log output, and trace spans — for those sentinels. Any hit fails the build.

This catches the realistic version of the bug, which is not "someone logged a password" but "an error object containing a config blob got serialized into a span attribute."

## Evals are not tests

Two different activities get confused, and the confusion produces a flaky suite that everyone learns to ignore.

| | Tests | Evals |
|---|---|---|
| Question | Does the runtime enforce its rules? | Does the agent do its job well? |
| Model | Mocked | Real |
| Result | Pass or fail | A score |
| Determinism | Required | Impossible |
| Blocks a merge | Yes | No |
| Cadence | Every commit | Scheduled, or before a prompt change |

**Tests never call a real model provider.** Mock at the model gateway boundary and return recorded or synthetic responses, including tool-call requests. The gateway is the correct seam: everything above it — policy, trust propagation, destination resolution, budgets, audit — is deterministic and fully testable without a network call.

To test that the runtime denies a write-tier tool call on untrusted context, the mock simply returns that tool call. No prompt engineering, no real inference, no flakiness.

**Evals** run separately, track quality over time, and gate prompt changes rather than code merges. They belong in the pipeline, just not in the one that blocks merges.

## Database strategy

<!-- docs-check: allow sqlite -->

One engine, one matrix. Integration tests run against **PGlite** — real PostgreSQL compiled to WASM, in-process, no server and no container — which satisfies the "no Docker" constraint in `docs/19-tech-stack.md` while testing the engine that runs in production.

An earlier revision parameterized these tests over two dialects and ran them twice. That is gone with SQLite, and it removed a subtle hazard along with the runtime: the two runs were not testing the same thing. R3 and R4 were database constraints on one and application code on the other, so they could pass and fail independently, and a green report meant less than it appeared to.

Practical setup:

- a fresh in-process database per test file, migrated from the committed migrations — **not** from `drizzle-kit push`, so CI exercises the migration path that production will run
- truncate between tests within a file rather than re-migrating; it is an order of magnitude faster and the isolation is sufficient
- one suite that migrates from empty and asserts the result matches the schema modules, which is how schema drift is caught

**Nothing is skipped conditionally.** A skipped security test is worse than an absent one, because the report looks green.

## Fixtures

A fixture builder, not shared static data. Static fixtures accumulate coupling until no one can change a row without breaking unrelated tests.

Every fixture set includes:

- **two teams**, always, for isolation
- **a user in each**, plus one user in both, which is where role-resolution bugs hide
- **each of the five system roles** represented
- **an agent with narrow grants** and one with broad grants
- **a source connection with a populated allowlist** and one with an empty allowlist
- **knowledge items at each trust level**

The permission catalogue and system roles come from the real seed path, not a test-only copy. A test-only copy drifts, and then the suite passes against a permission model that production does not have.

## CI pipeline

```
lint, format, typecheck
unit                                  (fast, no I/O)
migrate      (empty -> head, assert no drift from the schema modules)
integration  (PGlite)
contract     (recorded connector fixtures)
security     (R1-R5, C2 matrix, C3, isolation, W1-W8, T16, injection corpus, secret scan)
e2e          (critical journeys)
```

The `security` stage is named separately on purpose. It should be visible in the CI report as its own result, and it should never be the stage someone skips to ship a hotfix.

## Coverage

Line coverage is a weak signal and a bad target — it is trivially gamed and it says nothing about whether the twelve cells of the capability matrix were exercised.

Track instead a short list of things that **must** have tests, and fail the build if any is missing:

- every cell of the C2 capability matrix
- every invariant R1–R5
- every wallet-auth threat W1–W8
- the API key trust ceiling, T16, including the default
- every repository method, for tenant isolation
- every tool `risk_tier` assignment
- every ingress path, against the injection corpus — API key included

This is a checklist that can be verified mechanically, and it maps to the claims the documentation makes.

## What not to spend effort on

- **T1, direct prompt injection.** A user manipulating their own agent reaches only their own privileges, and the audit trail names them. `docs/17-threat-model.md` already rates it low. Do not build a suite for it.
- **Model output quality in CI.** That is evals.
- **Third-party SDK behaviour.** Test your adapter, not their client.
- **Exhaustive CRUD permutations.** Test the authorization wrapper once, thoroughly, and the handlers for their own logic.
