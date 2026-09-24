import { Plus, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { profileDetails, type RosterMember, rosterMemberSave, type TelegramProfile } from '@/apis';
import { Field } from '@/components/field';
import { ProfilePicker } from '@/components/profile-picker';
import { MEMBER_ROLE_MAX, MEMBER_ROLES_MAX, SOCIAL_NETWORKS } from '@/libs/constant';
import { apiError, t } from '@/libs/i18n';
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
    const [roles, setRoles] = useState<string[]>([]);
    const [role, setRole] = useState('');
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
        setRoles(member?.roles ?? []);
        setRole('');
        setDescription(member?.description ?? '');
        setSocial(
            Object.entries(member?.social ?? {}).map(([network, handle]) => ({ network, handle })),
        );
        setProfileId(member?.profile_id);
        setLinked(member?.profile_id === undefined ? '' : t('team.dialog.theirProfile'));
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

    const withRole = (list: string[]) => {
        const next = role.trim();

        return next === '' ||
            list.length >= MEMBER_ROLES_MAX ||
            list.some((known) => known.toLowerCase() === next.toLowerCase())
            ? list
            : [...list, next];
    };

    const addRole = () => {
        setRoles(withRole);
        setRole('');
    };

    const save = async () => {
        setBusy(true);
        setError(null);

        try {
            const result = await rosterMemberSave(
                teamId,
                {
                    name: name.trim(),
                    roles: withRole(roles),
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
            setError(apiError(cause, 'team.errors.saveFailed'));
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
                            {member === null
                                ? t('team.dialog.addTitle')
                                : t('team.dialog.editTitle', { name: member.name })}
                        </DialogTitle>
                        <DialogDescription>{t('team.dialog.description')}</DialogDescription>
                    </DialogHeader>

                    <Field
                        label={t('team.field.profile.label')}
                        hint={
                            profileId === undefined
                                ? t('team.field.profile.hint')
                                : t('team.field.profile.hintLinked', { name: linked })
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
                                        message={t('team.field.profile.unlink')}
                                    />
                                )}
                            </Stack>
                        )}
                    </Field>

                    <Stack direction="Vertical" className="gap-5 sm:grid sm:grid-cols-2">
                        <Field label={t('team.field.name.label')} hint={t('team.field.name.hint')}>
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
                            label={t('team.field.roles.label')}
                            hint={t('team.field.roles.hint', { max: MEMBER_ROLES_MAX })}>
                            {(id) => (
                                <Stack direction="Vertical" className="gap-2">
                                    <Input
                                        id={id}
                                        value={role}
                                        onChange={(event) => setRole(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ',') {
                                                event.preventDefault();
                                                addRole();
                                            }
                                        }}
                                        onBlur={addRole}
                                        disabled={roles.length >= MEMBER_ROLES_MAX}
                                        maxLength={MEMBER_ROLE_MAX}
                                        placeholder={t('team.field.roles.placeholder')}
                                    />

                                    {roles.length > 0 && (
                                        <Stack direction="Horizontal" className="flex-wrap gap-1.5">
                                            {roles.map((item) => (
                                                <Button
                                                    key={item}
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    icon={<X />}
                                                    onClick={() =>
                                                        setRoles((current) =>
                                                            current.filter(
                                                                (known) => known !== item,
                                                            ),
                                                        )
                                                    }
                                                    message={item}
                                                />
                                            ))}
                                        </Stack>
                                    )}
                                </Stack>
                            )}
                        </Field>
                    </Stack>

                    <Field
                        label={t('team.field.description.label')}
                        hint={t('team.field.description.hint')}>
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
                        <Text type="BodyStrong" message={t('team.social.title')} />

                        {social.length === 0 && (
                            <Text type="BodyMuted" message={t('team.social.empty')} />
                        )}

                        {social.map((row, index) => (
                            <Stack
                                direction="Horizontal"
                                className="items-center gap-2"
                                // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and only ever removed by this index, so it is their identity
                                key={index}>
                                <Stack direction="Vertical" className="w-36 shrink-0">
                                    <Input
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
                                        placeholder={t('team.social.network')}
                                    />
                                </Stack>
                                <Stack direction="Vertical" className="min-w-0 grow">
                                    <Input
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
                                        placeholder={t('team.social.handle')}
                                    />
                                </Stack>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
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
                            message={t('team.social.add')}
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
                            message={t('team.dialog.cancel')}
                        />
                        <Button
                            type="submit"
                            disabled={busy || name.trim() === ''}
                            message={
                                busy
                                    ? t('team.dialog.saving')
                                    : member === null
                                      ? t('team.dialog.add')
                                      : t('team.dialog.save')
                            }
                        />
                    </DialogFooter>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
