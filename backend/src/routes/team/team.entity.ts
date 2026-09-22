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
 * A file the team owns, addressed by name -- `team.json` holds the roster.
 *
 * Text whatever the extension claims, so the same table takes anything added
 * later without a schema change. What a `.json` file must contain is enforced
 * where it is written (`team.roster.ts`), not by the column type: an agent
 * writes this, and a column cannot tell a damaged file from an empty one.
 *
 * Unique per team so a name is an address -- an agent asking for `team.json`
 * cannot get one of two rows depending on insertion order.
 */
@Entity({ name: 'team_document' })
@Unique([ 'team_id', 'name' ])
export class TeamDocument
{
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'text', default: '' })
    content: string;

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
     * The agent that answers people who message this bot. 0 means nobody
     * answers and the bot only records what it receives.
     */
    @Column({ type: 'int', default: 0 })
    agent_id: number;

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

/**
 * An OpenAI-compatible model endpoint a team can call.
 *
 * `api_key` is a credential and is treated exactly like `TeamBot.token`: never
 * returned, never logged, only ever summarised as a hint. `base_url` is the
 * compatible root (the part before `/chat/completions`), stored without a
 * trailing slash so callers can append paths safely.
 *
 * Unique per team on (base_url, model) so the same endpoint and model are not
 * registered twice; scoped to the team rather than the table so a clash cannot
 * reveal what another account has configured.
 *
 * ponytail: the key is stored as given, matching `team_bot.token`. Encrypting
 * at rest needs a key in config and a migration for existing rows.
 */
@Entity({ name: 'team_model' })
@Unique([ 'team_id', 'base_url', 'model' ])
export class TeamModel
{
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    /** A human label, so two keys against the same model can be told apart. */
    @Column({ type: 'varchar', length: 64 })
    name: string;

    /** The model identifier sent in the request body, e.g. `gpt-4o-mini`. */
    @Column({ type: 'varchar', length: 128 })
    model: string;

    @Column({ type: 'varchar', length: 256 })
    base_url: string;

    /** Blank for an endpoint that needs no key, which is usual for local models. */
    @Column({ type: 'varchar', length: 256, default: '' })
    api_key: string;

    /**
     * How many tokens this model can hold, or 0 when it was never recorded.
     *
     * Filled from the catalog when the model is picked from one and typed in by
     * hand for an endpoint that is not listed. The reply path trims history to
     * fit it, which is why 0 falls back to a deliberately small default rather
     * than an optimistic one: trimming history is recoverable, a request the
     * provider refuses for overrunning the window is not.
     */
    @Column({ type: 'int', default: 0 })
    context_tokens: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
