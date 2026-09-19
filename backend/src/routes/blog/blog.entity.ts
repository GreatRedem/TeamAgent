import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity('blog')
export class Blog
{
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 256, unique: true })
    slug!: string;

    @Column({ type: 'varchar', length: 256 })
    title!: string;

    @Column({ type: 'varchar', length: 512 })
    description!: string;

    @Column({ type: 'text' })
    content!: string;

    @Column({ type: 'mediumblob', default: null })
    image!: Buffer | null;

    @Column({ type: 'varchar', length: 32 })
    image_type!: string;

    @UpdateDateColumn()
    updated_at!: Date;

    @CreateDateColumn()
    created_at!: Date;
}
