import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

// Work an agent carries out at a set time. Times are timestamptz so the moment set on the page
// is the moment it runs, whatever the server's own time zone.
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

    // Who the result is sent to on Telegram; 0 keeps it on the page only.
    @Column({ type: 'int', default: 0 })
    profile_id: number;

    // When it next runs.
    @Index()
    @Column({ type: 'timestamptz' })
    start_at: Date;

    // none, daily or weekly.
    @Column({ type: 'varchar', length: 8, default: 'none' })
    repeat: string;

    // scheduled, running, done, failed or cancelled.
    @Index()
    @Column({ type: 'varchar', length: 16, default: 'scheduled' })
    status: string;

    @Column({ type: 'timestamptz', nullable: true, default: null })
    last_run_at: Date | null;

    @Column({ type: 'int', default: 0 })
    run_count: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

// One time a task ran: when, how it ended, what the agent produced and whether it was sent.
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

    // running, ok or error.
    @Column({ type: 'varchar', length: 16, default: 'running' })
    outcome: string;

    @Column({ type: 'text', default: '' })
    output: string;

    @Column({ type: 'boolean', default: false })
    delivered: boolean;

    @Column({ type: 'varchar', length: 240, default: '' })
    reason: string;
}
