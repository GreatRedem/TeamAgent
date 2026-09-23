import { useEffect, useId, useState } from 'react';

import { conversationList, type TelegramProfile } from '@/apis';
import { PROFILE_SEARCH_DELAY } from '@/libs/constant';
import { profileName } from '@/libs/profileName';
import { Input } from '@/ui/input';
import { Suggestions } from '@/ui/suggestions';

const pickLabel = (profile: TelegramProfile) =>
    `${profileName(profile)}${profile.username === '' ? '' : ` @${profile.username}`} #${profile.id}`;

export function ProfilePicker({
    id,
    teamId,
    onPick,
}: {
    id: string;
    teamId: number;
    onPick: (profile: TelegramProfile) => void;
}) {
    const listId = useId();

    const [search, setSearch] = useState('');
    const [found, setFound] = useState<TelegramProfile[]>([]);

    useEffect(() => {
        let active = true;

        const timer = setTimeout(() => {
            conversationList(teamId, { limit: 20 }, search)
                .then((payload) => {
                    if (active) {
                        setFound(payload.conversations);
                    }
                })
                .catch(() => {
                    if (active) {
                        setFound([]);
                    }
                });
        }, PROFILE_SEARCH_DELAY);

        return () => {
            active = false;

            clearTimeout(timer);
        };
    }, [teamId, search]);

    const pick = (value: string) => {
        setSearch(value);

        const chosen = Number(/#(\d+)$/.exec(value)?.[1]);
        const profile = found.find((candidate) => candidate.id === chosen);

        if (profile !== undefined) {
            setSearch('');
            onPick(profile);
        }
    };

    return (
        <>
            <Suggestions
                id={listId}
                options={found.map((profile) => ({ value: pickLabel(profile) }))}
            />
            <Input
                id={id}
                value={search}
                list={listId}
                onChange={(event) => pick(event.target.value)}
                placeholder="Search by name or username"
                autoComplete="off"
            />
        </>
    );
}
