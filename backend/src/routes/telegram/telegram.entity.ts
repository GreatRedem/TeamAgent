import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

/**
 * A person who has sent the team a private message, and the profile built from
 * what Telegram tells us about them.
 *
 * Scoped to the team rather than to one bot: a team can run several bots, and
 * the same person writing to two of them is still one person to the team. The
 * messages record which bot each one arrived through.
 *
 * `telegram_id` is a `bigint` because Telegram ids already exceed 32 bits and
 * are specified to reach 52. TypeORM surfaces bigint as a string, which is
 * what the column type here says -- reading it as a number would silently lose
 * precision on large ids.
 */
@Entity({ name: 'telegram_user' })
@Unique([ 'team_id', 'telegram_id' ])
export class TelegramUser
{
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'bigint' })
    telegram_id: string;

    // Everything below is Telegram's to change at any time, so each message
    // refreshes it rather than trusting what was captured on first contact.
    @Column({ type: 'varchar', length: 64, default: '' })
    username: string;

    @Column({ type: 'varchar', length: 128, default: '' })
    first_name: string;

    @Column({ type: 'varchar', length: 128, default: '' })
    last_name: string;

    @Column({ type: 'varchar', length: 16, default: '' })
    language_code: string;

    @Column({ type: 'int', default: 0 })
    message_count: number;

    /**
     * Comma-joined permission keys this person has been granted. Empty means
     * no permissions at all, not "all of them" -- see `telegram.permission.ts`.
     */
    @Column({ type: 'varchar', length: 512, default: '' })
    permissions: string;

    @Column({ type: 'timestamp' })
    last_seen_at: Date;

    @CreateDateColumn()
    created_at: Date;
}

/**
 * One inbound private message.
 *
 * Unique on `(bot_id, update_id)` because Telegram redelivers an update until
 * it gets a 2xx, so the same message can legitimately arrive several times.
 */
@Entity({ name: 'telegram_message' })
@Unique([ 'bot_id', 'update_id' ])
export class TelegramMessage
{
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Index()
    @Column({ type: 'int' })
    user_id: number;

    @Column({ type: 'int' })
    bot_id: number;

    @Column({ type: 'bigint' })
    update_id: string;

    @Column({ type: 'bigint' })
    chat_id: string;

    @Column({ type: 'text' })
    text: string;

    /**
     * 'in' for what the person sent, 'out' for what an agent replied. Rows that
     * predate agents default to 'in', which is what they were.
     */
    @Column({ type: 'varchar', length: 3, default: 'in' })
    direction: string;

    /** When Telegram says it was sent, as opposed to when it was stored. */
    @Column({ type: 'timestamp' })
    sent_at: Date;

    @CreateDateColumn()
    created_at: Date;
}
