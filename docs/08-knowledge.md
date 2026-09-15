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
| Field | Description |
|---|---|
| `id` | Internal unique identifier |
| `team_id` | Owning team |
| `name` | Knowledge item or collection name |
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

**Schema gap:** ranked semantic retrieval needs a chunk and embedding table, and `docs/14-database.md` does not define one yet. Steps 2 and 3 are not implementable as written until it exists — Phase 5 work, left out deliberately rather than guessed at.

## Security Requirements
- Confidential knowledge must be isolated from unauthorized agents.
- Retrieval should respect team and user permissions.
- Untrusted sources must be normalized or validated before use.

## Notes
Knowledge is not just raw data. It is governed context with access boundaries, relevance, and lifecycle management.
