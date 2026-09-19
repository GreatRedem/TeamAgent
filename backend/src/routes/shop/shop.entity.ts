import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'shop' })
export class Shop
{
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 256 })
    name: string;

    @Column({ type: 'int' })
    item!: number;

    @Column({ type: 'int' })
    type!: number; // 1 Head, 2 Neck, ETC

    @Column({ type: 'int' })
    count!: number;

    @Column({ type: 'int' })
    category!: number;

    @Column({ type: 'float' })
    price!: number;

    @Column({ type: 'int' })
    realm_id!: number;

    @CreateDateColumn()
    created_at!: Date;
}
