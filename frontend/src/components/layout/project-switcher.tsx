import { Check, ChevronsUpDown, LayoutGrid } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { type Team, teamDetails, teamList } from '@/apis';
import { TEAM_NAMES } from '@/libs/constant';
import { teamPath } from '@/libs/navigation';
import { Button } from '@/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { Text } from '@/ui/text';

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
                <Button
                    variant="ghost"
                    size="sm"
                    className="min-w-0"
                    icon={<ChevronsUpDown className="text-muted-foreground" />}
                    iconPosition="end"
                    message={label}
                />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>Projects</DropdownMenuLabel>

                {teams === null && (
                    <Text type="BodyMuted" className="px-2 py-1.5" message="Loading…" />
                )}

                {teams !== null && teams.length === 0 && (
                    <Text type="BodyMuted" className="px-2 py-1.5" message="No projects yet." />
                )}

                {teams?.map((team) => (
                    <DropdownMenuItem key={team.id} asChild>
                        <Link to={teamPath(team.id)}>
                            <Check
                                className={team.id === teamId ? 'opacity-100' : 'opacity-0'}
                                aria-hidden="true"
                            />
                            <Text
                                type="Foreground"
                                as="span"
                                className="truncate"
                                message={team.name}
                            />
                        </Link>
                    </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />

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
