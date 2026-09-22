import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'team' })
export class Team {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'varchar', length: 280, default: '' })
    description: string;

    @Index()
    @Column({ type: 'int' })
    account_id: number;

    // Set while the project is archived: it leaves the project list until it is restored.
    @Column({ type: 'timestamp', nullable: true, default: null })
    archived_at: Date | null;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

@Entity({ name: 'team_document' })
@Unique(['team_id', 'name'])
export class TeamDocument {
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

@Entity({ name: 'team_bot' })
@Unique(['team_id', 'token'])
export class TeamBot {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'varchar', length: 128 })
    token: string;

    @Column({ type: 'varchar', length: 64, default: '' })
    webhook_secret: string;

    @Column({ type: 'varchar', length: 256, default: '' })
    public_url: string;

    @Column({ type: 'int', default: 0 })
    agent_id: number;

    @Column({ type: 'bigint', default: 0 })
    poll_offset: string;

    @CreateDateColumn()
    created_at: Date;
}

@Entity({ name: 'team_model' })
@Unique(['team_id', 'base_url', 'model'])
export class TeamModel {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'varchar', length: 128 })
    model: string;

    @Column({ type: 'varchar', length: 256 })
    base_url: string;

    @Column({ type: 'varchar', length: 256, default: '' })
    api_key: string;

    @Column({ type: 'int', default: 0 })
    context_tokens: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
