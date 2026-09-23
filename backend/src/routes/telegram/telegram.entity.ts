import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'telegram_user' })
@Unique(['team_id', 'telegram_id'])
export class TelegramUser {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'bigint' })
    telegram_id: string;

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

    @Column({ type: 'varchar', length: 512, default: '' })
    permissions: string;

    @Column({ type: 'timestamp' })
    last_seen_at: Date;

    @CreateDateColumn()
    created_at: Date;
}

@Entity({ name: 'telegram_user_document' })
@Unique(['user_id', 'agent_id', 'name'])
export class TelegramUserDocument {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    user_id: number;

    @Index()
    @Column({ type: 'int', default: 0 })
    agent_id: number;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'text' })
    content: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

@Entity({ name: 'telegram_message' })
@Unique(['bot_id', 'update_id'])
export class TelegramMessage {
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

    @Column({ type: 'varchar', length: 3, default: 'in' })
    direction: string;

    @Column({ type: 'timestamp' })
    sent_at: Date;

    @CreateDateColumn()
    created_at: Date;
}
