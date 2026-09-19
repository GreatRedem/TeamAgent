import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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
