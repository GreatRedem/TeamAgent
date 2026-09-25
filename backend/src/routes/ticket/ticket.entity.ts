import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'ticket' })
export class Ticket {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    account_id: number;

    @Column({ type: 'varchar', length: 120 })
    subject: string;

    @Index()
    @Column({ type: 'varchar', length: 12, default: 'open' })
    status: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

@Entity({ name: 'ticket_message' })
export class TicketMessage {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    ticket_id: number;

    @Column({ type: 'int' })
    account_id: number;

    @Column({ type: 'boolean', default: false })
    staff: boolean;

    @Column({ type: 'text' })
    body: string;

    @CreateDateColumn()
    created_at: Date;
}
