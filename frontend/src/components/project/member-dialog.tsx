import { Plus, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import {
    ApiError,
    profileDetails,
    type RosterMember,
    rosterMemberSave,
    type TelegramProfile,
} from '@/apis';
import { Field } from '@/components/field';
import { ProfilePicker } from '@/components/profile-picker';
import { ROSTER_ERRORS, SOCIAL_NETWORKS } from '@/libs/constant';
import { profileName } from '@/libs/profileName';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Stack } from '@/ui/stack';
import { Suggestions } from '@/ui/suggestions';
import { Text } from '@/ui/text';
import { Textarea } from '@/ui/textarea';

interface SocialRow {
    network: string;
    handle: string;
}

export function MemberDialog({
    open,
    teamId,
    member,
    onOpenChange,
    onSaved,
}: {
    open: boolean;
    teamId: number;
    member: RosterMember | null;
    onOpenChange: (open: boolean) => void;
    onSaved: (members: RosterMember[]) => void;
}) {
    const listId = useId();

    const [name, setName] = useState('');
    const [rank, setRank] = useState('');
    const [description, setDescription] = useState('');
    const [social, setSocial] = useState<SocialRow[]>([]);
    const [profileId, setProfileId] = useState<number | undefined>(undefined);
    const [linked, setLinked] = useState('');

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        setName(member?.name ?? '');
        setRank(member?.rank ?? '');
        setDescription(member?.description ?? '');
        setSocial(
            Object.entries(member?.social ?? {}).map(([network, handle]) => ({ network, handle })),
        );
        setProfileId(member?.profile_id);
        setLinked(member?.profile_id === undefined ? '' : 'their Telegram profile');
        setError(null);
    }, [open, member]);

    useEffect(() => {
        if (!open || member?.profile_id === undefined) {
            return;
        }

        let active = true;

        profileDetails(teamId, member.profile_id)
            .then((details) => {
                if (active) {
                    setLinked(profileName(details.profile));
                }
            })
            .catch(() => {});

        return () => {
            active = false;
        };
    }, [open, member, teamId]);

    const pick = (profile: TelegramProfile) => {
        setProfileId(profile.id);
        setLinked(
            profile.username === ''
                ? profileName(profile)
                : `${profileName(profile)} @${profile.username}`,
        );

        if (name.trim() === '') {
            setName(profileName(profile));
        }

        if (profile.username !== '') {
            setSocial((rows) => [
                ...rows.filter((row) => row.network !== 'telegram'),
                { network: 'telegram', handle: `@${profile.username}` },
            ]);
        }
    };

    const save = async () => {
        setBusy(true);
        setError(null);

        try {
            const result = await rosterMemberSave(
                teamId,
                {
                    name: name.trim(),
                    rank: rank.trim(),
                    description: description.trim(),
                    social: Object.fromEntries(
                        social
                            .map((row) => [row.network.trim(), row.handle.trim()])
                            .filter(([network, handle]) => network !== '' && handle !== ''),
                    ),
                    ...(profileId !== undefined && { profile_id: profileId }),
                },
                member?.name,
            );

            onSaved(result.members);
            onOpenChange(false);
        } catch (cause) {
            setError(
                cause instanceof ApiError
                    ? (ROSTER_ERRORS[cause.result] ?? cause.result)
                    : 'The member could not be saved.',
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto">
                <Stack
                    direction="Vertical"
                    as="form"
                    className="gap-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save();
                    }}>
                    <DialogHeader>
                        <DialogTitle>
                            {member === null ? 'Add a team member' : `Modify ${member.name}`}
                        </DialogTitle>
                        <DialogDescription>
                            What goes here is written to team.json, which agents allowed to read it
                            answer from.
                        </DialogDescription>
                    </DialogHeader>

                    <Field
                        label="From a profile"
                        hint={
                            profileId === undefined
                                ? 'Optional. Pick someone who has written to a bot to link them.'
                                : `Linked to ${linked}.`
                        }>
                        {(id) => (
                            <Stack direction="Horizontal" className="items-center gap-2">
                                <ProfilePicker id={id} teamId={teamId} onPick={pick} />
                                {profileId !== undefined && (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setProfileId(undefined);
                                            setLinked('');
                                        }}
                                        message="Unlink"
                                    />
                                )}
                            </Stack>
                        )}
                    </Field>

                    <Stack direction="Vertical" className="gap-5 sm:grid sm:grid-cols-2">
                        <Field label="Name" hint="How the agents will refer to them.">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    maxLength={120}
                                    required
                                />
                            )}
                        </Field>

                        <Field
                            label="Rank"
                            hint="Their role on the team, such as founder or support lead.">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={rank}
                                    onChange={(event) => setRank(event.target.value)}
                                    maxLength={200}
                                />
                            )}
                        </Field>
                    </Stack>

                    <Field label="Description" hint="What they do, and what to ask them about.">
                        {(id) => (
                            <Textarea
                                id={id}
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                maxLength={2000}
                            />
                        )}
                    </Field>

                    <Suggestions
                        id={`${listId}-networks`}
                        options={SOCIAL_NETWORKS.map((network) => ({ value: network }))}
                    />

                    <Stack direction="Vertical" className="gap-2">
                        <Text type="BodyStrong" message="Social networks" />

                        {social.length === 0 && (
                            <Text type="BodyMuted" message="None recorded yet." />
                        )}

                        {social.map((row, index) => (
                            <Stack
                                direction="Horizontal"
                                className="items-center gap-2"
                                // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and only ever removed by this index, so it is their identity
                                key={index}>
                                <Stack direction="Vertical" className="w-36 shrink-0">
                                    <Input
                                        aria-label="Network"
                                        list={`${listId}-networks`}
                                        value={row.network}
                                        onChange={(event) =>
                                            setSocial((rows) =>
                                                rows.map((item, at) =>
                                                    at === index
                                                        ? { ...item, network: event.target.value }
                                                        : item,
                                                ),
                                            )
                                        }
                                        maxLength={32}
                                        placeholder="network"
                                    />
                                </Stack>
                                <Stack direction="Vertical" className="min-w-0 grow">
                                    <Input
                                        aria-label="Handle or address"
                                        value={row.handle}
                                        onChange={(event) =>
                                            setSocial((rows) =>
                                                rows.map((item, at) =>
                                                    at === index
                                                        ? { ...item, handle: event.target.value }
                                                        : item,
                                                ),
                                            )
                                        }
                                        maxLength={300}
                                        placeholder="@handle or link"
                                    />
                                </Stack>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Remove this network"
                                    icon={<X />}
                                    onClick={() =>
                                        setSocial((rows) => rows.filter((_, at) => at !== index))
                                    }
                                />
                            </Stack>
                        ))}

                        <Button
                            variant="outline"
                            size="sm"
                            className="self-start"
                            icon={<Plus />}
                            onClick={() =>
                                setSocial((rows) => [...rows, { network: '', handle: '' }])
                            }
                            message="Add a network"
                        />
                    </Stack>

                    {error !== null && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            message="Cancel"
                        />
                        <Button
                            type="submit"
                            disabled={busy || name.trim() === ''}
                            message={
                                busy ? 'Saving…' : member === null ? 'Add member' : 'Save changes'
                            }
                        />
                    </DialogFooter>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
