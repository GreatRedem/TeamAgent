import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'account' })
export class Account {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', default: 0 })
    role: number;

    @Column({ type: 'varchar', length: 42, unique: true })
    wallet: string;

    @CreateDateColumn()
    created_at: Date;
}

@Entity({ name: 'account_session' })
export class AccountSession {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 1024 })
    token: string;

    @Column({ type: 'varchar', length: 512 })
    device: string;

    @Index()
    @Column({ type: 'int' })
    account_id: number;

    @Column({ type: 'timestamp', nullable: true })
    revoked_at: Date | null;

    @Column({ type: 'timestamp' })
    expires_at: Date;

    @CreateDateColumn()
    created_at: Date;
}

@Entity({ name: 'account_nonce' })
export class AccountNonce {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'varchar', length: 42 })
    address: string;

    @Column({ type: 'varchar', length: 64, unique: true })
    nonce: string;

    @Column({ type: 'varchar', length: 1024 })
    message: string;

    @Column({ type: 'timestamp', nullable: true })
    consumed_at: Date | null;

    @Column({ type: 'timestamp' })
    expires_at: Date;

    @CreateDateColumn()
    created_at: Date;
}
