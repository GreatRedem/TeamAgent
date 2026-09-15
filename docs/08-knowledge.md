# Knowledge

`Knowledge` is information agents can retrieve and use as context while performing tasks.

## Sources
Documents, PDFs, URLs, websites, Notion, GitHub, databases, internal records, and custom knowledge bases.

## Responsibilities
- Store or reference knowledge.
- Organize content into knowledge bases.
- Make content searchable.
- Control user and agent access.
- Track updates and versions.
- Support retrieval during agent execution.

## Suggested Fields
| Field | Description |
|---|---|
| `id` | Internal identifier |
| `team_id` | Owning team |
| `name` | Knowledge item or collection |
| `type` | Document, URL, database, etc. |
| `source` | Origin reference |
| `metadata` | Tags, author, dates, etc. |
| `status` | Ready, processing, failed, archived |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Typical Retrieval Flow
1. Agent receives a task.
2. Relevant knowledge is identified.
3. Content is searched and ranked.
4. Retrieved content is supplied as context.
5. The model generates a response using that context.

Confidential knowledge must be isolated from agents that do not need access.
