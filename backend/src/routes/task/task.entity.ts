import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'team_task' })
export class TeamTask {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'int' })
    agent_id: number;

    @Column({ type: 'varchar', length: 120 })
    title: string;

    @Column({ type: 'text', default: '' })
    description: string;

    @Column({ type: 'text', default: '' })
    goal: string;

    @Column({ type: 'int', default: 0 })
    profile_id: number;

    @Index()
    @Column({ type: 'timestamptz' })
    start_at: Date;

    @Column({ type: 'varchar', length: 8, default: 'none' })
    repeat: string;

    @Index()
    @Column({ type: 'varchar', length: 16, default: 'scheduled' })
    status: string;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    last_run_at: Date | null;

    @Column({ type: 'int', default: 0 })
    run_count: number;

    @Column({ type: 'int', default: 0 })
    retry_count: number;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    retry_at: Date | null;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

@Entity({ name: 'team_task_run' })
export class TeamTaskRun {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    task_id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'timestamptz' })
    started_at: Date;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    finished_at: Date | null;

    @Column({ type: 'varchar', length: 16, default: 'running' })
    outcome: string;

    @Column({ type: 'text', default: '' })
    output: string;

    @Column({ type: 'boolean', default: false })
    delivered: boolean;

    @Column({ type: 'varchar', length: 240, default: '' })
    reason: string;

    @Column({ type: 'varchar', length: 128, default: '' })
    model: string;

    @Column({ type: 'int', default: 0 })
    prompt_tokens: number;

    @Column({ type: 'int', default: 0 })
    completion_tokens: number;

    @Column({ type: 'int', default: 0 })
    tool_calls: number;

    @Column({ type: 'text', default: '[]' })
    log: string;
}
