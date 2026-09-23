import { useEffect, useState } from 'react';

import {
    ApiError,
    type PluginKind,
    type PluginKindKey,
    pluginCreate,
    pluginUpdate,
    type TeamAgent,
    type TeamPlugin,
} from '@/apis';
import { Field } from '@/components/field';
import { PLUGIN_ERRORS, PLUGIN_EVENT_LABELS } from '@/libs/constant';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { CodeBlock } from '@/ui/code-block';
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
import { Separator } from '@/ui/separator';
import { Stack } from '@/ui/stack';
import { Switch } from '@/ui/switch';
import { Text } from '@/ui/text';

export function PluginDialog({
    open,
    teamId,
    plugin,
    kinds,
    events,
    agents,
    onOpenChange,
    onSaved,
}: {
    open: boolean;
    teamId: number;
    plugin: TeamPlugin | null;
    kinds: PluginKind[];
    events: string[];
    agents: TeamAgent[];
    onOpenChange: (open: boolean) => void;
    onSaved: (plugin: TeamPlugin) => void;
}) {
    const [kindKey, setKindKey] = useState<PluginKindKey>('telegram');
    const [name, setName] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [fields, setFields] = useState<Record<string, string>>({});
    const [clear, setClear] = useState<string[]>([]);
    const [revealed, setRevealed] = useState<string[]>([]);
    const [access, setAccess] = useState<number[]>([]);
    const [hookAgent, setHookAgent] = useState('0');
    const [hookUrl, setHookUrl] = useState('');
    const [hookEvents, setHookEvents] = useState<string[]>([]);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const kind = kinds.find((candidate) => candidate.key === kindKey) ?? kinds[0];

    useEffect(() => {
        if (!open) {
            return;
        }

        setKindKey(plugin?.kind ?? kinds[0]?.key ?? 'telegram');
        setName(plugin?.name ?? '');
        setEnabled(plugin?.enabled ?? true);
        setFields({ ...plugin?.config });
        setClear([]);
        setRevealed([]);
        setAccess(plugin?.agents ?? []);
        setHookAgent(String(plugin?.hook_agent_id ?? 0));
        setHookUrl(plugin?.hook_url ?? '');
        setHookEvents(plugin?.hook_events ?? events);
        setError(null);
    }, [open, plugin, kinds, events]);

    const toggle = <T,>(list: T[], item: T) =>
        list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];

    const save = async () => {
        if (kind === undefined) {
            return;
        }

        setBusy(true);
        setError(null);

        const draft = {
            ...(plugin === null && { kind: kind.key }),
            name: name.trim(),
            enabled,
            fields,
            clear,
            agents: access,
            hook_agent_id: Number(hookAgent),
            hook_url: hookUrl.trim(),
            hook_events: hookEvents,
        };

        try {
            onSaved(
                plugin === null
                    ? await pluginCreate(teamId, draft)
                    : await pluginUpdate(teamId, plugin.id, draft),
            );
            onOpenChange(false);
        } catch (cause) {
            setError(
                cause instanceof ApiError
                    ? (PLUGIN_ERRORS[cause.result] ?? cause.result)
                    : 'The plugin could not be saved.',
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
                            {plugin === null ? 'Add a plugin' : `Modify ${plugin.name}`}
                        </DialogTitle>
                        <DialogDescription>
                            {kind?.description ??
                                'Connect an app the agents can post to, reply on and read from.'}
                        </DialogDescription>
                    </DialogHeader>

                    <Stack direction="Vertical" className="gap-5 sm:grid sm:grid-cols-2">
                        {plugin === null && (
                            <Field label="Kind">
                                {(id) => (
                                    <Select
                                        id={id}
                                        value={kindKey}
                                        onValueChange={(value) => {
                                            setKindKey(value as PluginKindKey);
                                            setFields({});
                                        }}>
                                        {kinds.map((option) => (
                                            <SelectItem key={option.key} value={option.key}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </Select>
                                )}
                            </Field>
                        )}

                        <Field label="Name" hint="How agents and this page refer to it.">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    maxLength={64}
                                    autoComplete="off"
                                    required
                                    placeholder={`${kind?.label ?? 'Plugin'} main`}
                                />
                            )}
                        </Field>
                    </Stack>

                    {kind?.fields.map((field) => {
                        const saved = plugin?.secrets[field.key];
                        const removing = clear.includes(field.key);

                        return (
                            <Field
                                key={field.key}
                                label={field.required ? field.label : `${field.label} (optional)`}
                                hint={
                                    field.secret && saved !== undefined
                                        ? removing
                                            ? 'Removed when you save.'
                                            : `Saved as ${saved}. Leave it blank to keep it. ${field.hint}`
                                        : field.hint
                                }>
                                {(id) => (
                                    <Stack direction="Horizontal" className="items-center gap-2">
                                        <Input
                                            id={id}
                                            name={field.key}
                                            type={
                                                field.secret && !revealed.includes(field.key)
                                                    ? 'password'
                                                    : field.format === 'url'
                                                      ? 'url'
                                                      : 'text'
                                            }
                                            inputMode={
                                                field.format === 'numeric' ? 'numeric' : undefined
                                            }
                                            autoComplete="off"
                                            spellCheck={false}
                                            required={field.required && saved === undefined}
                                            value={fields[field.key] ?? ''}
                                            disabled={removing}
                                            onChange={(event) =>
                                                setFields((current) => ({
                                                    ...current,
                                                    [field.key]: event.target.value,
                                                }))
                                            }
                                            maxLength={512}
                                            placeholder={
                                                saved !== undefined ? saved : field.placeholder
                                            }
                                        />
                                        {field.secret && (
                                            <Button
                                                variant="outline"
                                                disabled={removing}
                                                onClick={() =>
                                                    setRevealed((current) =>
                                                        toggle(current, field.key),
                                                    )
                                                }
                                                message={
                                                    revealed.includes(field.key) ? 'Hide' : 'Show'
                                                }
                                            />
                                        )}
                                        {field.secret && !field.required && saved !== undefined && (
                                            <Button
                                                variant="outline"
                                                onClick={() =>
                                                    setClear((current) =>
                                                        toggle(current, field.key),
                                                    )
                                                }
                                                message={removing ? 'Keep' : 'Remove'}
                                            />
                                        )}
                                    </Stack>
                                )}
                            </Field>
                        );
                    })}

                    <Stack direction="Horizontal" className="items-center gap-2">
                        <Switch
                            id="plugin-enabled"
                            checked={enabled}
                            onCheckedChange={setEnabled}
                        />
                        <Text
                            type="Body"
                            as="label"
                            htmlFor="plugin-enabled"
                            message={
                                enabled ? 'On' : 'Off: agents cannot use it and it does not answer'
                            }
                        />
                    </Stack>

                    <Separator />

                    <Stack direction="Vertical" className="gap-3">
                        <Text type="BodyStrong" message="Agents that may use it" />
                        <Text
                            type="Caption"
                            message={`They get ${kind?.tools.map((tool) => tool.name).join(', ') ?? 'its tools'}.`}
                        />

                        {agents.length === 0 && (
                            <Text type="BodyMuted" message="This project has no agents yet." />
                        )}

                        <Stack direction="Horizontal" className="flex-wrap gap-x-6 gap-y-3">
                            {agents.map((agent) => {
                                const id = `plugin-agent-${agent.id}`;

                                return (
                                    <Stack
                                        direction="Horizontal"
                                        className="items-center gap-2"
                                        key={agent.id}>
                                        <Switch
                                            id={id}
                                            checked={access.includes(agent.id)}
                                            onCheckedChange={() =>
                                                setAccess((current) => toggle(current, agent.id))
                                            }
                                        />
                                        <Text
                                            type="Body"
                                            as="label"
                                            htmlFor={id}
                                            message={agent.name}
                                        />
                                    </Stack>
                                );
                            })}
                        </Stack>
                    </Stack>

                    <Separator />

                    <Stack direction="Vertical" className="gap-5">
                        <Stack direction="Vertical" className="gap-1">
                            <Text type="BodyStrong" message="Hooks" />
                            <Text
                                type="Caption"
                                message="What happens when something arrives, and where events are sent."
                            />
                        </Stack>

                        {kind !== undefined && kind.inbound !== 'none' && (
                            <Field label="Answered by" hint={kind.inbound_hint}>
                                {(id) => (
                                    <Select id={id} value={hookAgent} onValueChange={setHookAgent}>
                                        <SelectItem value="0">Nobody, only record it</SelectItem>
                                        {agents.map((agent) => (
                                            <SelectItem key={agent.id} value={String(agent.id)}>
                                                {agent.name}
                                            </SelectItem>
                                        ))}
                                    </Select>
                                )}
                            </Field>
                        )}

                        {kind?.inbound === 'webhook' && (
                            <Stack direction="Vertical" className="gap-2">
                                <Text type="BodyStrong" message="Webhook address" />
                                {plugin === null || plugin.hook_path === '' ? (
                                    <Text
                                        type="BodyMuted"
                                        message="The address and its secret appear here once the plugin is saved."
                                    />
                                ) : (
                                    <>
                                        <CodeBlock
                                            message={`${window.location.origin}/api${plugin.hook_path}`}
                                        />
                                        <Text
                                            type="Caption"
                                            message={
                                                kind.key === 'instagram'
                                                    ? 'Verify token'
                                                    : 'Secret, sent in the x-nura-secret header'
                                            }
                                        />
                                        <CodeBlock message={plugin.hook_secret} />
                                    </>
                                )}
                            </Stack>
                        )}

                        <Field
                            label="Forward events to (optional)"
                            hint={
                                plugin === null
                                    ? 'Each event is posted there as JSON, signed in x-nura-signature with a secret shown after saving.'
                                    : `Each event is posted there as JSON, signed in x-nura-signature with HMAC-SHA256 of the body and ${plugin.hook_secret.slice(0, 6)}….`
                            }>
                            {(id) => (
                                <Input
                                    id={id}
                                    type="url"
                                    autoComplete="off"
                                    value={hookUrl}
                                    onChange={(event) => setHookUrl(event.target.value)}
                                    maxLength={512}
                                    placeholder="https://hooks.example.com/nura"
                                />
                            )}
                        </Field>

                        {hookUrl.trim() !== '' && (
                            <Stack direction="Horizontal" className="flex-wrap gap-x-6 gap-y-3">
                                {events.map((event) => {
                                    const id = `plugin-event-${event}`;

                                    return (
                                        <Stack
                                            direction="Horizontal"
                                            className="items-center gap-2"
                                            key={event}>
                                            <Switch
                                                id={id}
                                                checked={hookEvents.includes(event)}
                                                onCheckedChange={() =>
                                                    setHookEvents((current) =>
                                                        toggle(current, event),
                                                    )
                                                }
                                            />
                                            <Text
                                                type="Body"
                                                as="label"
                                                htmlFor={id}
                                                message={PLUGIN_EVENT_LABELS[event] ?? event}
                                            />
                                        </Stack>
                                    );
                                })}
                            </Stack>
                        )}
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
                            disabled={busy}
                            message={
                                busy
                                    ? 'Saving and testing…'
                                    : plugin === null
                                      ? 'Add plugin'
                                      : 'Save changes'
                            }
                        />
                    </DialogFooter>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
