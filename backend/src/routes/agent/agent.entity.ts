import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'team_agent' })
export class TeamAgent {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'varchar', length: 280, default: '' })
    description: string;

    @Column({ type: 'int', default: 0 })
    model_id: number;

    @Column({ type: 'varchar', length: 256, default: '' })
    permissions: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

@Entity({ name: 'team_agent_exchange' })
export class TeamAgentExchange {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    team_id: number;

    @Index()
    @Column({ type: 'int' })
    agent_id: number;

    @Column({ type: 'int', default: 0 })
    model_id: number;

    @Column({ type: 'int', default: 0 })
    user_id: number;

    @Column({ type: 'int', default: 0 })
    round: number;

    @Column({ type: 'text' })
    request: string;

    @Column({ type: 'text' })
    response: string;

    @Column({ type: 'int', default: 0 })
    tool_calls: number;

    // What the model reported reading and writing for this call; 0 when it reported nothing.
    @Column({ type: 'int', default: 0 })
    prompt_tokens: number;

    @Column({ type: 'int', default: 0 })
    completion_tokens: number;

    // The provider reported no count for this call, so the two above are estimated.
    @Column({ type: 'boolean', default: false })
    tokens_estimated: boolean;

    @Column({ type: 'int', default: 0 })
    duration_ms: number;

    @Column({ type: 'varchar', length: 16, default: 'ok' })
    outcome: string;

    @Column({ type: 'varchar', length: 128, default: '' })
    reason: string;

    @Index()
    @CreateDateColumn()
    created_at: Date;
}

@Entity({ name: 'team_agent_document' })
@Unique(['agent_id', 'name'])
export class TeamAgentDocument {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    agent_id: number;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column({ type: 'text' })
    content: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
