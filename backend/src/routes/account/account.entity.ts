import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'account' })
export class Account
{
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', default: 0 })
    role: number;

    @Column({ type: 'float', default: 0 })
    usdt: number;

    @Column({ type: 'varchar', length: 256 })
    email: string;

    @Column({ type: 'varchar', length: 32 })
    username: string;

    @Column({ type: 'varchar', length: 32 })
    password: string;

    @Column({ type: 'varchar', length: 16 })
    phone: string;

    @Column({ type: 'varchar', length: 64, nullable: true })
    source: string;

    @CreateDateColumn()
    created_at: Date;
}

@Entity({ name: 'account_session' })
export class AccountSession
{
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 1024 })
    token: string;

    @Column({ type: 'varchar', length: 512 })
    device: string;

    @Column({ type: 'int' })
    account_id: number;

    @Column({ type: 'datetime', nullable: true })
    revoked_at: Date | undefined;

    @Column({ type: 'datetime' })
    expires_at: Date;

    @CreateDateColumn()
    created_at: Date;
}

@Entity({ name: 'account_recovery' })
export class AccountRecovery
{
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 32 })
    token: string;

    @Column({ type: 'varchar', length: 512 })
    device: string;

    @Column({ type: 'int' })
    account_id: number;

    @Column({ type: 'datetime', nullable: true })
    used_at: Date | undefined;

    @CreateDateColumn()
    created_at: Date;
}

@Entity({ name: 'account_transfer' })
export class AccountTransfer
{
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int' })
    account_id: number;

    @Column({ type: 'varchar', length: 32 })
    username: string;

    @Column({ type: 'varchar', length: 32 })
    password: string;

    @Column({ type: 'varchar', length: 256 })
    email: string;

    @Column({ type: 'varchar', length: 16 })
    phone: string;

    @Column({ type: 'float', default: 0 })
    usdt: number;

    @Column({ type: 'varchar', length: 64 })
    realm: string;

    @Column({ type: 'int', default: 0 })
    status: number;

    @UpdateDateColumn()
    updated_at: Date;

    @CreateDateColumn()
    created_at: Date;
}

@Entity({ name: 'account_history' })
export class AccountHistory
{
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 256 })
    tag: string;

    @Column({ type: 'int' })
    account_id: number;

    @Column({ type: 'varchar', length: 512, nullable: true })
    value1: string | undefined;

    @Column({ type: 'varchar', length: 512, nullable: true })
    value2: string | undefined;

    @Column({ type: 'varchar', length: 512, nullable: true })
    value3: string | undefined;

    @Column({ type: 'varchar', length: 512, nullable: true })
    value4: string | undefined;

    @Column({ type: 'varchar', length: 512, nullable: true })
    value5: string | undefined;

    @Column({ type: 'varchar', length: 512 })
    user_agent: string;

    @Column({ type: 'varchar', length: 128 })
    ip: string;

    @CreateDateColumn()
    created_at: Date;
}
