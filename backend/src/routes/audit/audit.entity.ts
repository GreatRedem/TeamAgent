import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'audit_log' })
@Index(['team_id', 'created_at'])
export class AuditLog {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int', default: 0 })
    team_id: number;

    @Column({ type: 'int', default: 0 })
    account_id: number;

    @Column({ type: 'varchar', length: 64 })
    action: string;

    @Column({ type: 'varchar', length: 64, default: '' })
    target: string;

    @Column({ type: 'varchar', length: 16, default: 'ok' })
    outcome: string;

    @Column({ type: 'varchar', length: 512, default: '' })
    detail: string;

    @Column({ type: 'int', default: 0 })
    duration_ms: number;

    @Column({ type: 'varchar', length: 16, default: 'owner' })
    actor: string;

    @Index()
    @CreateDateColumn()
    created_at: Date;
}
