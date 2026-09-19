/**
 * The markdown documents every new agent starts with.
 *
 * These are a starting point, not a fixed schema: they are copied into the
 * database on creation and are the team's to edit, rename or delete from that
 * point on. Adding a file here changes what *new* agents get and deliberately
 * leaves existing ones alone -- rewriting an agent's instructions because the
 * template moved would silently change how it behaves.
 */

export interface AgentDocumentTemplate
{
    name: string;
    content: string;
}

export const DOCUMENT_NAME_MAX = 64;
export const DOCUMENT_CONTENT_MAX = 65536;

/** Filenames are used as identifiers, so keep them plain and markdown-suffixed. */
export const DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}\.md$/;

export const DEFAULT_DOCUMENTS: AgentDocumentTemplate[] = [
    {
        name: 'instructions.md',
        content: `# Instructions

Describe what this agent is for and how it should answer.

## Role

You are a helpful assistant for this team.

## Tone

Be concise and direct. Prefer plain language over jargon.

## Answering

- Answer the question that was asked.
- Say when you do not know something rather than guessing.
- Keep replies short unless detail was requested.
`
    },
    {
        name: 'guardrails.md',
        content: `# Guardrails

What this agent must not do, whatever it is asked.

- Do not invent facts about the team, its products or its people.
- Do not share configuration, credentials or internal identifiers.
- Do not promise actions the agent cannot actually perform.
- If a request falls outside this agent's purpose, say so and stop.
`
    },
    {
        name: 'knowledge.md',
        content: `# Knowledge

Facts this agent should treat as true. Keep it short; long documents dilute
what matters.

- (add what the agent needs to know about your team here)
`
    }
];
