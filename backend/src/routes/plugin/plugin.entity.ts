import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'team_plugin' })
@Unique(['team_id', 'name'])
export class TeamPlugin {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'varchar', length: 16 })
    kind: string;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'boolean', default: true })
    enabled: boolean;

    @Column({ type: 'text', default: '{}' })
    secrets: string;

    @Column({ type: 'text', default: '{}' })
    config: string;

    @Column({ type: 'varchar', length: 512, default: '' })
    agents: string;

    @Column({ type: 'int', default: 0 })
    hook_agent_id: number;

    @Column({ type: 'varchar', length: 512, default: '' })
    hook_url: string;

    @Column({ type: 'varchar', length: 256, default: '' })
    hook_events: string;

    @Column({ type: 'varchar', length: 64, default: '' })
    hook_secret: string;

    @Column({ type: 'varchar', length: 128, default: '' })
    account: string;

    @Column({ type: 'bigint', default: 0 })
    poll_offset: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

@Entity({ name: 'team_plugin_call' })
export class TeamPluginCall {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    plugin_id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'int', default: 0 })
    agent_id: number;

    @Column({ type: 'varchar', length: 8 })
    direction: string;

    @Column({ type: 'varchar', length: 64 })
    action: string;

    @Column({ type: 'boolean', default: true })
    ok: boolean;

    @Column({ type: 'int', default: 0 })
    status: number;

    @Column({ type: 'int', default: 0 })
    duration_ms: number;

    @Index()
    @Column({ type: 'varchar', length: 128, default: '' })
    thread: string;

    @Column({ type: 'text', default: '' })
    request: string;

    @Column({ type: 'text', default: '' })
    response: string;

    @Column({ type: 'varchar', length: 240, default: '' })
    error: string;

    @Index()
    @CreateDateColumn({ type: 'timestamptz' })
    created_at: Date;
}
