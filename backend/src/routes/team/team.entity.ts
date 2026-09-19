import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity({ name: 'team' })
export class Team
{
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'varchar', length: 280, default: '' })
    description: string;

    /**
     * The account that created the team. Every query filters on this, so a team
     * belonging to someone else is indistinguishable from one that does not
     * exist. Indexed because listing is always scoped to one account.
     */
    @Index()
    @Column({ type: 'int' })
    account_id: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

/**
 * A Telegram bot registered against a team.
 *
 * `token` is a BotFather credential: whoever holds it controls the bot, so it
 * is never sent back to the client -- handlers return a hint built from it
 * instead. Unique per team so the same bot cannot be added twice; the scope is
 * the team rather than the table so adding a token another account already
 * registered does not report a conflict and confirm it exists.
 *
 * ponytail: stored as given, matching `account_session.token`. Encrypting at
 * rest needs a key in config and a migration for existing rows.
 */
@Entity({ name: 'team_bot' })
@Unique([ 'team_id', 'token' ])
export class TeamBot
{
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'varchar', length: 128 })
    token: string;

    /**
     * Shared with Telegram via `setWebhook`, returned on every delivery in the
     * `X-Telegram-Bot-Api-Secret-Token` header. It is what makes the otherwise
     * public webhook url safe. Blank until the webhook is first registered.
     */
    @Column({ type: 'varchar', length: 64, default: '' })
    webhook_secret: string;

    /**
     * This bot's own public origin, e.g. `https://bots.example.com`. Each bot
     * carries its own because they need not be reachable at the same place.
     *
     * It is also the mode switch: set means Telegram pushes to a webhook,
     * blank means the poller pulls with `getUpdates` instead.
     */
    @Column({ type: 'varchar', length: 256, default: '' })
    public_url: string;

    /**
     * `getUpdates` offset, only used in polling mode. Persisted so a restart
     * neither replays what was already stored nor skips what arrived while the
     * process was down. bigint-as-string for the same reason as the ids.
     */
    @Column({ type: 'bigint', default: 0 })
    poll_offset: string;

    @CreateDateColumn()
    created_at: Date;
}
