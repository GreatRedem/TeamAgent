import enActivity from './en/activity';
import enAgents from './en/agents';
import enAuth from './en/auth';
import enBots from './en/bots';
import enCommon from './en/common';
import enErrors from './en/errors';
import enLayout from './en/layout';
import enModels from './en/models';
import enOverview from './en/overview';
import enPeople from './en/people';
import enProjects from './en/projects';
import enTasks from './en/tasks';
import enTeam from './en/team';
import enTools from './en/tools';
import faActivity from './fa/activity';
import faAgents from './fa/agents';
import faAuth from './fa/auth';
import faBots from './fa/bots';
import faCommon from './fa/common';
import faErrors from './fa/errors';
import faLayout from './fa/layout';
import faModels from './fa/models';
import faOverview from './fa/overview';
import faPeople from './fa/people';
import faProjects from './fa/projects';
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
    ...enErrors,
};

const fa: Messages<typeof en> = {
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
    ...faErrors,
};

export type MessageKey = keyof typeof en;

export const DICTIONARIES: Record<string, Messages<typeof en>> = { en, fa };
