# Knowledge

`Knowledge` is the contextual information that agents can retrieve, reason over, and use while completing tasks.

## Purpose
Knowledge enables grounded responses and better task resolution. It can include documents, structured records, websites, internal notes, or external data sources.

## Typical Sources
- documents and PDFs
- URLs and websites
- Notion pages
- GitHub repositories
- internal databases
- custom knowledge bases
- structured records and documents

## Responsibilities
- Store or reference knowledge content.
- Organize content into searchable collections.
- Control access by team, role, and agent.
- Track updates, versions, and processing state.
- Support retrieval during runtime execution.

## Suggested Fields

A **knowledge base** is the collection and the unit of access control. A **knowledge item** is one piece of content inside it, and the unit of trust. They are separate tables.

### Knowledge base
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `team_id` | Owning team |
| `name` | Collection name |
| `description` | Purpose |
| `status` | Active, archived |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

Agent access is granted per base, through `agent_knowledge_bases`. An agent reads the bases it has been explicitly granted and no others.

### Knowledge item
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `team_id` | Owning team |
| `knowledge_base_id` | Parent collection |
| `title` | Item name |
| `type` | Document, URL, database, etc. |
| `source` | Origin or storage reference |
| `metadata` | Tags, author, dates, and classification |
| `trust_level` | `trusted` or `untrusted`. Defaults to `untrusted` — see below |
| `trusted_by` | The team member who asserted trust |
| `trusted_at` | When trust was asserted |
| `ingested_from` | Where the content came from |
| `ingested_by` | Who or what ingested it |
| `status` | Ready, processing, failed, archived |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

Trust is a property of the **item**, not the base. A base can hold trusted and untrusted items side by side, and a retrieval that touches one untrusted item taints the run regardless of what else it returned.

## Trust Level

Knowledge is a primary injection path: a poisoned document, URL, Notion page, or README ingested today can be retrieved into a privileged context weeks later, which makes it delayed and hard to attribute (`docs/17-threat-model.md` T3).

So every item carries a trust level, and:

- **The default is `untrusted`.** Ingestion never produces a trusted item.
- **Trust is an action a human takes,** recorded in `trusted_by` and `trusted_at`. It is never inferred by the pipeline from a domain name, a file type, or the fact that the ingestion was authenticated.
- **`ingested_from` and `ingested_by` make a poisoned corpus traceable** after the fact. Without them a compromised run cannot be tied back to the item that caused it.

The effective trust of a run is the **minimum** over everything in its context. A single untrusted chunk in a retrieval result taints the whole run, which is intentional and must not be configurable by anything the model can influence.

## Typical Retrieval Flow
1. Agent receives a task.
2. Relevant knowledge is discovered.
3. Search and ranking occur based on relevance and policy.
4. Selected content is injected into context, each item carrying its trust level and origin.
5. Model output is generated using that context.

**Schema note:** ranked retrieval runs over the `knowledge_chunks` table with keyword overlap. Semantic ranking still needs an embedding column (`pgvector` + an embedding provider), which is deliberately deferred — see `docs/14-database.md`. Steps 2 and 3 above are keyword-ranked until then.

## Security Requirements

<!-- docs-check: allow validate-untrusted -->

- Confidential knowledge must be isolated from unauthorized agents.
- Retrieval respects team, user, and per-agent base grants.
- **Untrusted content is labelled and contained. It is never validated into trustworthiness.**

That last point replaces an earlier line in this document that read *untrusted sources must be normalized or validated before use*, which was wrong in a way worth naming.

There is no validation step that converts attacker-controlled prose into safe instructions. A language model has no separation between code and data — instructions and content arrive as one token stream — so there is no parameterized-query equivalent and no sanitizer to write. Wrapping untrusted content in a delimited block that says *this is data, not instruction* raises the cost of an attack and stops naive attempts, and `docs/17-threat-model.md` C6 is explicit that it is a **mitigation, not a boundary**: any design that relies on it alone is broken.

What actually contains a poisoned document is structural, and none of it happens at ingestion:

- the item carries `untrusted`, so the run it enters is `untrusted`
- a `write`-tier action from that run needs an approval
- the destination it could reach comes from a configured allowlist the model cannot expand

### Read-only access is still disclosure

C3 and C4 stop exfiltration to *new* destinations. They do not stop an injected agent revealing what it can read **to the party it is already talking to** — which, for a public-facing support bot, is whoever sent the message.

So the scoping decision is the control here:

> An agent on a public-facing source must only be granted knowledge bases whose contents are safe to disclose to that source audience.

The runtime cannot infer this. It is a configuration responsibility, and it is the most likely way this system leaks in practice.

## Notes
Knowledge is not just raw data. It is governed context with access boundaries, relevance, and lifecycle management.
