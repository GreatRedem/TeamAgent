import type { EntityManager } from 'typeorm';
import { PLANS } from '../../constant.js';

import { BadRequestResponse } from '../../utils/response.js';
import { TeamAgent } from '../agent/agent.entity.js';
import { TeamTask } from '../task/task.entity.js';
import { Team, TeamBot } from '../team/team.entity.js';
import { Account } from './account.entity.js';

export interface PlanLimits {
    projects: number;
    agents: number;
    bots: number;
    tasks: number;
}

export interface Plan {
    key: string;
    price: number | null;
    limits: PlanLimits | null;
}

type Store = Pick<EntityManager, 'getRepository'>;

type Counted = 'agents' | 'bots' | 'tasks';

export function activePlan(
    account: { plan: string; plan_until: Date | null },
    now = new Date(),
): Plan {
    const chosen = PLANS.find((plan) => plan.key === account.plan) ?? (PLANS[0] as Plan);

    return account.plan_until !== null && account.plan_until <= now ? (PLANS[0] as Plan) : chosen;
}

export async function accountPlan(db: Store, accountId: number): Promise<Plan> {
    const account = await db.getRepository(Account).findOneBy({ id: accountId });

    return account ? activePlan(account) : (PLANS[0] as Plan);
}

export async function projectRoom(db: Store, accountId: number): Promise<void> {
    const limit = (await accountPlan(db, accountId)).limits?.projects;

    if (
        limit !== undefined &&
        (await db.getRepository(Team).countBy({ account_id: accountId })) >= limit
    ) {
        throw new BadRequestResponse('PLAN_LIMIT_PROJECTS');
    }
}

export async function teamUsage(db: Store, teamId: number): Promise<Record<Counted, number>> {
    return {
        agents: await db.getRepository(TeamAgent).countBy({ team_id: teamId }),
        bots: await db.getRepository(TeamBot).countBy({ team_id: teamId }),
        tasks: await db.getRepository(TeamTask).countBy({ team_id: teamId }),
    };
}

export async function teamRoom(
    db: Store,
    teamId: number,
    kinds: Counted[],
    adding = 1,
): Promise<void> {
    const team = await db.getRepository(Team).findOneBy({ id: teamId });
    const limits = team ? (await accountPlan(db, team.account_id)).limits : null;

    if (limits === null) {
        return;
    }

    const used = await teamUsage(db, teamId);
    const over = kinds.find((kind) => used[kind] + adding > limits[kind]);

    if (over !== undefined) {
        throw new BadRequestResponse(`PLAN_LIMIT_${over.toUpperCase()}`);
    }
}
