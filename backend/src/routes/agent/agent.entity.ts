import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

/**
 * An agent: a named role bound to one of the team's model endpoints, described
 * by a set of markdown documents.
 *
 * `model_id` is a plain column rather than a TypeORM relation, matching the
 * rest of this codebase -- nothing here uses relations, and the joins needed
 * are single lookups. It is cleared to 0 when the model it points at is
 * removed, so an agent never carries a dangling reference; 0 reads as "no
 * model attached" and the agent reports it as such rather than erroring.
 */
@Entity({ name: 'team_agent' })
export class TeamAgent
{
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'varchar', length: 280, default: '' })
    description: string;

    /** The team model this agent talks through. 0 when none is attached. */
    @Column({ type: 'int', default: 0 })
    model_id: number;

    /**
     * Comma-joined capability keys from `agent.permission.ts`. Empty means the
     * agent can talk but cannot touch anyone's files.
     */
    @Column({ type: 'varchar', length: 256, default: '' })
    permissions: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

/**
 * One round-trip between an agent and its model.
 *
 * This is the conversation as the *model* saw it, which is not the same as the
 * Telegram thread: it includes the system prompt, the replayed history, tool
 * calls and tool results. Stored so a surprising answer can be traced back to
 * exactly what was asked.
 *
 * `request` holds the full message array. That duplicates conversation text
 * into a second table, so it inherits the same privacy weight as
 * `telegram_message` and needs the same retention answer -- see the note in
 * CLAUDE.md. Credentials never appear: the API key travels in a header, not in
 * the body recorded here.
 */
@Entity({ name: 'team_agent_exchange' })
export class TeamAgentExchange
{
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Index()
    @Column({ type: 'int' })
    agent_id: number;

    @Column({ type: 'int', default: 0 })
    model_id: number;

    /** The profile this exchange was on behalf of. 0 if not tied to one. */
    @Column({ type: 'int', default: 0 })
    user_id: number;

    /** Which tool round this was, starting at 0. */
    @Column({ type: 'int', default: 0 })
    round: number;

    /** The full message array sent to the model, as JSON. */
    @Column({ type: 'text' })
    request: string;

    /** The assistant turn that came back, as JSON. */
    @Column({ type: 'text' })
    response: string;

    @Column({ type: 'int', default: 0 })
    tool_calls: number;

    @Column({ type: 'int', default: 0 })
    duration_ms: number;

    @Column({ type: 'varchar', length: 16, default: 'ok' })
    outcome: string;

    @Column({ type: 'varchar', length: 128, default: '' })
    reason: string;

    @Index()
    @CreateDateColumn()
    created_at: Date;
}

/**
 * One markdown document belonging to an agent.
 *
 * These are what actually define the agent's behaviour, so they are stored as
 * editable text rather than being generated from a template each time. A new
 * agent is seeded with the default set in `agent.template.ts`; after that the
 * documents are the team's to change.
 *
 * Unique per agent on name, so a file cannot be shadowed by a second copy.
 */
@Entity({ name: 'team_agent_document' })
@Unique([ 'agent_id', 'name' ])
export class TeamAgentDocument
{
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    agent_id: number;

    /** Filename including the `.md` suffix, e.g. `instructions.md`. */
    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'text' })
    content: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
