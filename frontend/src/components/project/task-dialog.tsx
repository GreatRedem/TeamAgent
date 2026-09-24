import { useEffect, useState } from 'react';

import {
    type TaskRepeat,
    type TeamAgent,
    type TeamTask,
    type TelegramGroup,
    taskCreate,
    taskUpdate,
    teamGroups,
} from '@/apis';
import { Field } from '@/components/field';
import { ProfilePicker } from '@/components/profile-picker';
import { TASK_REPEAT_LABELS } from '@/libs/constant';
import { localInputValue } from '@/libs/format';
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
import { Select, SelectItem } from '@/ui/select';
import { Stack } from '@/ui/stack';
import { Textarea } from '@/ui/textarea';

export function TaskDialog({
    open,
    teamId,
    task,
    agents,
    onOpenChange,
    onSaved,
}: {
    open: boolean;
    teamId: number;
    task: TeamTask | null;
    agents: TeamAgent[];
    onOpenChange: (open: boolean) => void;
    onSaved: (task: TeamTask) => void;
}) {
    const [title, setTitle] = useState('');
    const [goal, setGoal] = useState('');
    const [description, setDescription] = useState('');
    const [agentId, setAgentId] = useState('');
    const [profileId, setProfileId] = useState(0);
    const [profile, setProfile] = useState('');
    const [startAt, setStartAt] = useState('');
    const [repeat, setRepeat] = useState<TaskRepeat>('none');
    const [group, setGroup] = useState('');
    const [groups, setGroups] = useState<TelegramGroup[]>([]);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        setTitle(task?.title ?? '');
        setGoal(task?.goal ?? '');
        setDescription(task?.description ?? '');
        setAgentId(String(task?.agent_id ?? agents[0]?.id ?? ''));
        setProfileId(task?.profile_id ?? 0);
        setProfile(task?.profile_name ?? '');
        setStartAt(
            localInputValue(
                task === null ? new Date(Date.now() + 10 * 60_000) : new Date(task.start_at),
            ),
        );
        setRepeat(task?.repeat ?? 'none');
        setGroup(
            task === null || task.group_chat_id === ''
                ? ''
                : `${task.group_bot_id}:${task.group_chat_id}`,
        );
        setError(null);
    }, [open, task, agents]);

    useEffect(() => {
        if (!open) {
            return;
        }

        teamGroups(teamId)
            .then((result) => setGroups(result.groups))
            .catch(() => setGroups([]));
    }, [open, teamId]);

    const save = async () => {
        setBusy(true);
        setError(null);

        const draft = {
            title: title.trim(),
            goal: goal.trim(),
            description: description.trim(),
            agent_id: Number(agentId),
            profile_id: profileId,
            group_bot_id: group === '' ? 0 : Number(group.slice(0, group.indexOf(':'))),
            group_chat_id: group === '' ? '' : group.slice(group.indexOf(':') + 1),
            start_at: new Date(startAt).toISOString(),
            repeat,
        };

        try {
            onSaved(
                task === null
                    ? await taskCreate(teamId, draft)
                    : await taskUpdate(teamId, task.id, draft),
            );
            onOpenChange(false);
        } catch (cause) {
            setError(apiError(cause, 'tasks.errors.saveFailed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85dvh] overflow-y-auto">
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
                            {task === null
                                ? t('tasks.dialog.newTitle')
                                : t('tasks.dialog.editTitle', { title: task.title })}
                        </DialogTitle>
                        <DialogDescription>{t('tasks.dialog.description')}</DialogDescription>
                    </DialogHeader>

                    <Field label={t('tasks.field.title.label')}>
                        {(id) => (
                            <Input
                                id={id}
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                maxLength={120}
                                required
                                placeholder={t('tasks.field.title.placeholder')}
                            />
                        )}
                    </Field>

                    <Field label={t('tasks.field.goal.label')} hint={t('tasks.field.goal.hint')}>
                        {(id) => (
                            <Textarea
                                id={id}
                                value={goal}
                                onChange={(event) => setGoal(event.target.value)}
                                maxLength={2000}
                                className="min-h-16"
                                placeholder={t('tasks.field.goal.placeholder')}
                            />
                        )}
                    </Field>

                    <Field
                        label={t('tasks.field.description.label')}
                        hint={t('tasks.field.description.hint')}>
                        {(id) => (
                            <Textarea
                                id={id}
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                maxLength={4000}
                                className="min-h-24"
                                placeholder={t('tasks.field.description.placeholder')}
                            />
                        )}
                    </Field>

                    <Field label={t('tasks.field.agent.label')} hint={t('tasks.field.agent.hint')}>
                        {(id) => (
                            <Select
                                id={id}
                                value={agentId}
                                onValueChange={setAgentId}
                                placeholder={t('tasks.field.agent.placeholder')}>
                                {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={String(agent.id)}>
                                        {agent.name}
                                    </SelectItem>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field
                        label={t('tasks.field.sendTo.label')}
                        hint={
                            profileId === 0
                                ? t('tasks.field.sendTo.hint')
                                : t('tasks.field.sendTo.hintPicked', { name: profile })
                        }>
                        {(id) => (
                            <Stack direction="Horizontal" className="items-center gap-2">
                                <ProfilePicker
                                    id={id}
                                    teamId={teamId}
                                    onPick={(picked) => {
                                        setProfileId(picked.id);
                                        setProfile(profileName(picked));
                                    }}
                                />
                                {profileId !== 0 && (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setProfileId(0);
                                            setProfile('');
                                        }}
                                        message={t('tasks.field.sendTo.clear')}
                                    />
                                )}
                            </Stack>
                        )}
                    </Field>

                    <Field
                        label={t('tasks.field.group.label')}
                        hint={
                            groups.length === 0 && group === ''
                                ? t('tasks.field.group.empty')
                                : t('tasks.field.group.hint')
                        }>
                        {(id) => (
                            <Select id={id} value={group} onValueChange={setGroup}>
                                <SelectItem value="">{t('tasks.field.group.none')}</SelectItem>
                                {groups.map((item) => (
                                    <SelectItem
                                        key={`${item.bot_id}:${item.chat_id}`}
                                        value={`${item.bot_id}:${item.chat_id}`}>
                                        {t('tasks.field.group.option', {
                                            title: item.title,
                                            bot: item.bot_name,
                                        })}
                                    </SelectItem>
                                ))}
                                {group !== '' &&
                                    !groups.some(
                                        (item) => `${item.bot_id}:${item.chat_id}` === group,
                                    ) && (
                                        <SelectItem value={group}>
                                            {task?.group_title || group}
                                        </SelectItem>
                                    )}
                            </Select>
                        )}
                    </Field>

                    <Stack direction="Vertical" className="gap-5 sm:grid sm:grid-cols-2">
                        <Field
                            label={t('tasks.field.startAt.label')}
                            hint={t('tasks.field.startAt.hint')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    type="datetime-local"
                                    value={startAt}
                                    onChange={(event) => setStartAt(event.target.value)}
                                    required
                                />
                            )}
                        </Field>

                        <Field label={t('tasks.field.repeat.label')}>
                            {(id) => (
                                <Select
                                    id={id}
                                    value={repeat}
                                    onValueChange={(value) => setRepeat(value as TaskRepeat)}>
                                    {Object.entries(TASK_REPEAT_LABELS).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {t(label)}
                                        </SelectItem>
                                    ))}
                                </Select>
                            )}
                        </Field>
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
                            message={t('tasks.dialog.cancel')}
                        />
                        <Button
                            type="submit"
                            disabled={
                                busy || title.trim() === '' || agentId === '' || startAt === ''
                            }
                            message={
                                busy
                                    ? t('tasks.dialog.saving')
                                    : task === null
                                      ? t('tasks.dialog.create')
                                      : t('tasks.dialog.save')
                            }
                        />
                    </DialogFooter>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
