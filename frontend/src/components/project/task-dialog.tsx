import { useEffect, useState } from 'react';

import {
    ApiError,
    type TaskRepeat,
    type TeamAgent,
    type TeamTask,
    taskCreate,
    taskUpdate,
} from '@/apis';
import { Field } from '@/components/field';
import { ProfilePicker } from '@/components/profile-picker';
import { TASK_ERRORS, TASK_REPEAT_LABELS } from '@/libs/constant';
import { localInputValue } from '@/libs/format';
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

// Creates or edits a task: what to do and why, which agent does it, who gets the result and when
// it runs. `task` is null to create one.
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

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Each opening starts from the task being edited, or from a blank one due in ten minutes.
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
        setError(null);
    }, [open, task, agents]);

    const save = async () => {
        setBusy(true);
        setError(null);

        const draft = {
            title: title.trim(),
            goal: goal.trim(),
            description: description.trim(),
            agent_id: Number(agentId),
            profile_id: profileId,
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
            setError(
                cause instanceof ApiError
                    ? (TASK_ERRORS[cause.result] ?? cause.result)
                    : 'The task could not be saved.',
            );
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
                            {task === null ? 'New task' : `Modify ${task.title}`}
                        </DialogTitle>
                        <DialogDescription>
                            The agent carries it out at the time you set, with the tools it has, and
                            sends what it produces to the person you choose.
                        </DialogDescription>
                    </DialogHeader>

                    <Field label="Title">
                        {(id) => (
                            <Input
                                id={id}
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                maxLength={120}
                                required
                                placeholder="Morning weather for Alex"
                            />
                        )}
                    </Field>

                    <Field label="Goal" hint="What should be true once it is done.">
                        {(id) => (
                            <Textarea
                                id={id}
                                value={goal}
                                onChange={(event) => setGoal(event.target.value)}
                                maxLength={2000}
                                className="min-h-16"
                                placeholder="Alex knows whether to take a coat today."
                            />
                        )}
                    </Field>

                    <Field
                        label="Description"
                        hint="What to do, and anything the agent should know.">
                        {(id) => (
                            <Textarea
                                id={id}
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                maxLength={4000}
                                className="min-h-24"
                                placeholder="Look up today's weather in Tehran and write Alex a short message about it."
                            />
                        )}
                    </Field>

                    <Field
                        label="Agent"
                        hint="It uses this agent's instructions, model and tools. A task that searches the web needs one that may fetch web pages.">
                        {(id) => (
                            <Select
                                id={id}
                                value={agentId}
                                onValueChange={setAgentId}
                                placeholder="Pick an agent">
                                {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={String(agent.id)}>
                                        {agent.name}
                                    </SelectItem>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field
                        label="Send to"
                        hint={
                            profileId === 0
                                ? 'Optional. Nobody picked: the result is only kept here.'
                                : `Sent to ${profile} through the bot they last wrote to.`
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
                                        message="Clear"
                                    />
                                )}
                            </Stack>
                        )}
                    </Field>

                    <Stack direction="Vertical" className="gap-5 sm:grid sm:grid-cols-2">
                        <Field label="Runs at" hint="Your local time.">
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

                        <Field label="Repeats">
                            {(id) => (
                                <Select
                                    id={id}
                                    value={repeat}
                                    onValueChange={(value) => setRepeat(value as TaskRepeat)}>
                                    {Object.entries(TASK_REPEAT_LABELS).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
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
                            message="Cancel"
                        />
                        <Button
                            type="submit"
                            disabled={
                                busy || title.trim() === '' || agentId === '' || startAt === ''
                            }
                            message={
                                busy ? 'Saving…' : task === null ? 'Create task' : 'Save changes'
                            }
                        />
                    </DialogFooter>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
