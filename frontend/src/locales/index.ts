import enActivity from './en/activity';
import enAgents from './en/agents';
import enAuth from './en/auth';
import enBots from './en/bots';
import enCommon from './en/common';
import enErrors from './en/errors';
import enLanding from './en/landing';
import enLayout from './en/layout';
import enModels from './en/models';
import enOverview from './en/overview';
import enPeople from './en/people';
import enPlans from './en/plans';
import enProjects from './en/projects';
import enSupport from './en/support';
import enTasks from './en/tasks';
import enTeam from './en/team';
import enTools from './en/tools';
import faActivity from './fa/activity';
import faAgents from './fa/agents';
import faAuth from './fa/auth';
import faBots from './fa/bots';
import faCatalog from './fa/catalog';
import faCommon from './fa/common';
import faErrors from './fa/errors';
import faLanding from './fa/landing';
import faLayout from './fa/layout';
import faModels from './fa/models';
import faOverview from './fa/overview';
import faPeople from './fa/people';
import faPlans from './fa/plans';
import faProjects from './fa/projects';
import faSupport from './fa/support';
import faTasks from './fa/tasks';
import faTeam from './fa/team';
import faTools from './fa/tools';
import type { Messages } from './types';

const en = {
    ...enCommon,
    ...enAuth,
    ...enLayout,
    ...enProjects,
    ...enOverview,
    ...enActivity,
    ...enAgents,
    ...enModels,
    ...enBots,
    ...enPeople,
    ...enTasks,
    ...enTeam,
    ...enTools,
    ...enPlans,
    ...enSupport,
    ...enLanding,
    ...enErrors,
};

const fa: Messages<typeof en> = {
    ...faCatalog,
    ...faCommon,
    ...faAuth,
    ...faLayout,
    ...faProjects,
    ...faOverview,
    ...faActivity,
    ...faAgents,
    ...faModels,
    ...faBots,
    ...faPeople,
    ...faTasks,
    ...faTeam,
    ...faTools,
    ...faPlans,
    ...faSupport,
    ...faLanding,
    ...faErrors,
};

export type MessageKey = keyof typeof en;

export const DICTIONARIES: Record<string, Messages<typeof en>> = { en, fa };
