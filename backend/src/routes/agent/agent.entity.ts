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

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
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
