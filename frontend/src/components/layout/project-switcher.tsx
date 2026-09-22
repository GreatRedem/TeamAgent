import { Check, ChevronsUpDown, LayoutGrid, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { teamDetails, teamList, type Team } from '@/api';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TEAM_NAMES } from '@/lib/constant';
import { teamPath } from '@/lib/navigation';

export function ProjectSwitcher({ teamId }: { teamId: number }) {
    const [open, setOpen] = useState(false);
    const [teams, setTeams] = useState<Team[] | null>(null);
    const [fetched, setFetched] = useState({ id: 0, name: '' });

    const name = TEAM_NAMES.get(teamId) ?? (fetched.id === teamId ? fetched.name : '');

    useEffect(() => {
        if (teamId === 0 || TEAM_NAMES.has(teamId)) {
            return;
        }

        let active = true;

        teamDetails(teamId)
            .then((team) => {
                TEAM_NAMES.set(team.id, team.name);

                if (active) {
                    setFetched({ id: team.id, name: team.name });
                }
            })
            .catch(() => {});

        return () => {
            active = false;
        };
    }, [teamId]);

    useEffect(() => {
        if (!open || teams !== null) {
            return;
        }

        teamList()
            .then((payload) => {
                for (const team of payload.teams) {
                    TEAM_NAMES.set(team.id, team.name);
                }

                setTeams(payload.teams);
            })
            .catch(() => setTeams([]));
    }, [open, teams]);

    const label = teamId === 0 ? 'All projects' : name === '' ? `Project ${teamId}` : name;

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="min-w-0 gap-2 px-2 font-medium">
                    <span className="truncate">{label}</span>
                    <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>Projects</DropdownMenuLabel>

                {teams === null && (
                    <p className="m-0 px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
                )}

                {teams !== null && teams.length === 0 && (
                    <p className="m-0 px-2 py-1.5 text-sm text-muted-foreground">
                        No projects yet.
                    </p>
                )}

                {teams?.map((team) => (
                    <DropdownMenuItem key={team.id} asChild>
                        <Link to={teamPath(team.id)}>
                            <Check
                                className={team.id === teamId ? 'opacity-100' : 'opacity-0'}
                                aria-hidden="true"
                            />
                            <span className="truncate">{team.name}</span>
                        </Link>
                    </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />

                {teamId !== 0 && (
                    <DropdownMenuItem asChild>
                        <Link to={teamPath(teamId, 'settings')}>
                            <Settings2 aria-hidden="true" />
                            Project settings
                        </Link>
                    </DropdownMenuItem>
                )}

                <DropdownMenuItem asChild>
                    <Link to="/dashboard">
                        <LayoutGrid aria-hidden="true" />
                        All projects
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
