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
| `status` | Ready, processing, failed, archived |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Typical Retrieval Flow
1. Agent receives a task.
2. Relevant knowledge is discovered.
3. Search and ranking occur based on relevance and policy.
4. Selected content is injected into context.
5. Model output is generated using that context.

## Security Requirements
- Confidential knowledge must be isolated from unauthorized agents.
- Retrieval should respect team and user permissions.
- Untrusted sources must be normalized or validated before use.

## Notes
Knowledge is not just raw data. It is governed context with access boundaries, relevance, and lifecycle management.
