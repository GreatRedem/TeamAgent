import { useEffect, useState } from 'react';

import {
    type PluginKind,
    type PluginKindKey,
    pluginCreate,
    pluginUpdate,
    type TeamAgent,
    type TeamPlugin,
} from '@/apis';
import { Field } from '@/components/field';
import { fieldText, kindText } from '@/libs/catalog';
import { API_BASE_URL, PLUGIN_EVENT_LABELS } from '@/libs/constant';
import { apiError, t } from '@/libs/i18n';
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
            setError(apiError(cause, 'tools.errors.saveFailed'));
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
                            {plugin === null
                                ? t('tools.form.titleNew')
                                : t('tools.form.titleEdit', { name: plugin.name })}
                        </DialogTitle>
                        <DialogDescription>
                            {kind === undefined
                                ? t('tools.form.description')
                                : kindText(kind.key, 'description', kind.description)}
                        </DialogDescription>
                    </DialogHeader>

                    <Stack direction="Vertical" className="gap-5 sm:grid sm:grid-cols-2">
                        {plugin === null && (
                            <Field label={t('tools.form.kind')}>
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
                                                {kindText(option.key, 'label', option.label)}
                                            </SelectItem>
                                        ))}
                                    </Select>
                                )}
                            </Field>
                        )}

                        <Field label={t('tools.form.name')} hint={t('tools.form.nameHint')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    maxLength={64}
                                    autoComplete="off"
                                    required
                                    placeholder={
                                        kind === undefined
                                            ? t('tools.form.namePlaceholderDefault')
                                            : t('tools.form.namePlaceholder', {
                                                  kind: kindText(kind.key, 'label', kind.label),
                                              })
                                    }
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
                                label={
                                    field.required
                                        ? fieldText(kind.key, field.key, 'label', field.label)
                                        : t('tools.optionalField', {
                                              label: fieldText(
                                                  kind.key,
                                                  field.key,
                                                  'label',
                                                  field.label,
                                              ),
                                          })
                                }
                                hint={
                                    field.secret && saved !== undefined
                                        ? removing
                                            ? t('tools.form.secretRemoved')
                                            : t('tools.form.secretSaved', {
                                                  saved,
                                                  hint: fieldText(
                                                      kind.key,
                                                      field.key,
                                                      'hint',
                                                      field.hint,
                                                  ),
                                              })
                                        : fieldText(kind.key, field.key, 'hint', field.hint)
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
                                                    revealed.includes(field.key)
                                                        ? t('tools.form.hide')
                                                        : t('tools.form.show')
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
                                                message={
                                                    removing
                                                        ? t('tools.form.keep')
                                                        : t('tools.form.remove')
                                                }
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
                            message={enabled ? t('tools.form.on') : t('tools.form.off')}
                        />
                    </Stack>

                    {(kind === undefined || kind.tools.length > 0) && (
                        <>
                            <Separator />

                            <Stack direction="Vertical" className="gap-3">
                                <Text type="BodyStrong" message={t('tools.form.agentsTitle')} />
                                <Text
                                    type="Caption"
                                    message={
                                        kind === undefined
                                            ? t('tools.form.agentsToolsDefault')
                                            : t('tools.form.agentsTools', {
                                                  tools: kind.tools
                                                      .map((tool) => tool.name)
                                                      .join(', '),
                                              })
                                    }
                                />

                                {agents.length === 0 && (
                                    <Text type="BodyMuted" message={t('tools.noAgents')} />
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
                                                        setAccess((current) =>
                                                            toggle(current, agent.id),
                                                        )
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
                        </>
                    )}

                    <Separator />

                    <Stack direction="Vertical" className="gap-5">
                        <Stack direction="Vertical" className="gap-1">
                            <Text type="BodyStrong" message={t('tools.form.hooksTitle')} />
                            <Text type="Caption" message={t('tools.form.hooksDescription')} />
                        </Stack>

                        {kind !== undefined && kind.inbound !== 'none' && (
                            <Field
                                label={t('tools.form.answeredBy')}
                                hint={kindText(kind.key, 'inbound_hint', kind.inbound_hint)}>
                                {(id) => (
                                    <Select id={id} value={hookAgent} onValueChange={setHookAgent}>
                                        <SelectItem value="0">
                                            {t('tools.form.answeredByNobody')}
                                        </SelectItem>
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
                                <Text type="BodyStrong" message={t('tools.form.webhookTitle')} />
                                {plugin === null || plugin.hook_path === '' ? (
                                    <Text
                                        type="BodyMuted"
                                        message={t('tools.form.webhookPending')}
                                    />
                                ) : (
                                    <>
                                        <CodeBlock
                                            message={`${window.location.origin}${API_BASE_URL}${plugin.hook_path}`}
                                        />
                                        <Text
                                            type="Caption"
                                            message={
                                                kind.key === 'instagram'
                                                    ? t('tools.form.verifyToken')
                                                    : t('tools.form.secretHeader')
                                            }
                                        />
                                        <CodeBlock message={plugin.hook_secret} />
                                    </>
                                )}
                            </Stack>
                        )}

                        <Field
                            label={t('tools.form.forward')}
                            hint={
                                plugin === null
                                    ? t('tools.form.forwardHintNew')
                                    : t('tools.form.forwardHint', {
                                          secret: plugin.hook_secret.slice(0, 6),
                                      })
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
                                                message={
                                                    PLUGIN_EVENT_LABELS[event] === undefined
                                                        ? event
                                                        : t(PLUGIN_EVENT_LABELS[event])
                                                }
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
                            message={t('tools.form.cancel')}
                        />
                        <Button
                            type="submit"
                            disabled={busy}
                            message={
                                busy
                                    ? t('tools.form.saving')
                                    : plugin === null
                                      ? t('tools.form.add')
                                      : t('tools.form.save')
                            }
                        />
                    </DialogFooter>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
