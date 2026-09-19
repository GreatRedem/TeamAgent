import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * One recorded action.
 *
 * Deliberately flat -- an action name, what it touched, how it went, and a
 * short human-readable detail. No structured payload column, because the
 * interesting queries here are "what happened to this team" and "how much
 * happened per day", and both only need the columns below.
 *
 * `detail` never carries credentials or message content. Conversation text is
 * already stored in `telegram_message`; duplicating it here would spread the
 * same personal data across another table with a different retention story.
 */
@Entity({ name: 'audit_log' })
@Index([ 'team_id', 'created_at' ])
export class AuditLog
{
    @PrimaryGeneratedColumn()
    id: number;

    /** 0 for events not tied to a team. */
    @Index()
    @Column({ type: 'int', default: 0 })
    team_id: number;

    /** The account that acted. 0 when the actor is inbound Telegram traffic. */
    @Column({ type: 'int', default: 0 })
    account_id: number;

    /** Dotted name, e.g. `agent.request`, `bot.remove`. */
    @Column({ type: 'varchar', length: 64 })
    action: string;

    /** What it acted on, e.g. `agent:4`. Empty when not applicable. */
    @Column({ type: 'varchar', length: 64, default: '' })
    target: string;

    /** 'ok', 'error' or 'skipped'. */
    @Column({ type: 'varchar', length: 16, default: 'ok' })
    outcome: string;

    @Column({ type: 'varchar', length: 512, default: '' })
    detail: string;

    @Index()
    @CreateDateColumn()
    created_at: Date;
}
