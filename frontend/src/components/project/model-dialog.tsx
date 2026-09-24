import { useCallback, useEffect, useState } from 'react';

import {
    type CatalogModel,
    isOpenRouterUrl,
    modelListIds,
    modelProbe,
    type ProviderPreset,
    type TeamModelProbe,
} from '@/apis';
import { Field } from '@/components/field';
import { providerText } from '@/libs/catalog';
import { MODEL_AUTO_FREE, MODEL_LIST_DELAY, PROBE_TONE } from '@/libs/constant';
import { apiError, t, tk, tn } from '@/libs/i18n';
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
import { Suggestions } from '@/ui/suggestions';
import { Switch } from '@/ui/switch';
import { Text } from '@/ui/text';

export interface ModelDraft {
    name: string;
    model: string;
    baseUrl: string;
    apiKey: string;
    contextTokens: string;
}

function probeState(probe: TeamModelProbe | 'testing'): string {
    if (probe === 'testing') {
        return 'pending';
    }

    return probe.ok ? 'ok' : 'error';
}

function probeLabel(probe: TeamModelProbe | 'testing', autoFree: boolean): string {
    if (probe === 'testing') {
        return t('models.dialog.asking');
    }

    if (!probe.ok) {
        return tk(`errors.${probe.reason}`, probe.reason ?? t('models.dialog.noAnswer'));
    }

    const found = probe.found === true;
    const values = { count: probe.models ?? 0, window: probe.context ?? 0 };

    if ((probe.context ?? 0) > 0) {
        return autoFree
            ? t(
                  found
                      ? 'models.dialog.connected.freeWindow'
                      : 'models.dialog.connected.noFreeWindow',
                  values,
              )
            : t(
                  found
                      ? 'models.dialog.connected.foundWindow'
                      : 'models.dialog.connected.missingWindow',
                  values,
              );
    }

    return autoFree
        ? t(found ? 'models.dialog.connected.free' : 'models.dialog.connected.noFree', values)
        : t(found ? 'models.dialog.connected.found' : 'models.dialog.connected.missing', values);
}

export function ModelDialog({
    open,
    mode,
    teamId,
    modelId,
    draft,
    providers,
    catalog,
    catalogUrl,
    busy,
    error,
    onChange,
    onOpenChange,
    onSubmit,
}: {
    open: boolean;
    mode: 'create' | 'edit';
    teamId: number;
    modelId?: number;
    draft: ModelDraft;
    providers: ProviderPreset[];
    catalog: CatalogModel[];
    catalogUrl: string;
    busy: boolean;
    error: string | null;
    onChange: (draft: ModelDraft) => void;
    onOpenChange: (open: boolean) => void;
    onSubmit: (url: string) => void;
}) {
    const [provider, setProvider] = useState('');
    const [discovered, setDiscovered] = useState<string[]>([]);
    const [listing, setListing] = useState<
        'loading' | { count: number } | { reason: string } | null
    >(null);
    const [probe, setProbe] = useState<TeamModelProbe | 'testing' | null>(null);

    const preset = providers.find((candidate) => candidate.key === provider) ?? providers[0];
    const usesCatalog = mode === 'create' && preset?.catalog === true;
    const url = usesCatalog ? catalogUrl : draft.baseUrl.trim();
    const apiKey = draft.apiKey.trim();

    const openRouter = usesCatalog || isOpenRouterUrl(url);
    const autoFree = draft.model === MODEL_AUTO_FREE;

    const suggestions =
        discovered.length > 0 ? discovered : (preset?.models ?? []).map((entry) => entry.id);
    const listId = openRouter
        ? 'catalog-models'
        : suggestions.length > 0
          ? 'endpoint-models'
          : undefined;

    useEffect(() => {
        if (!open || url === '' || openRouter) {
            setListing(null);

            return;
        }

        let active = true;

        setListing('loading');

        const timer = setTimeout(() => {
            modelListIds(teamId, url, apiKey, mode === 'edit' ? modelId : undefined)
                .then((result) => {
                    if (!active) {
                        return;
                    }

                    setDiscovered(result.ids);
                    setListing(
                        result.ok
                            ? { count: result.ids.length }
                            : { reason: result.reason ?? t('models.dialog.listFailed') },
                    );
                })
                .catch((cause: unknown) => {
                    if (!active) {
                        return;
                    }

                    setDiscovered([]);
                    setListing({ reason: apiError(cause, 'models.dialog.listFailed') });
                });
        }, MODEL_LIST_DELAY);

        return () => {
            active = false;

            clearTimeout(timer);
        };
    }, [open, url, apiKey, openRouter, teamId, mode, modelId]);

    const modelHint = openRouter
        ? t('models.dialog.catalogHint')
        : listing === 'loading'
          ? t('models.dialog.listing')
          : listing !== null && 'count' in listing
            ? tn('models.dialog.offered', listing.count)
            : listing !== null
              ? tk(`errors.${listing.reason}`, listing.reason)
              : undefined;

    const chooseModel = useCallback(
        (slug: string) => {
            const entry =
                catalog.find((candidate) => candidate.id === slug.trim()) ??
                preset?.models.find((candidate) => candidate.id === slug.trim());

            onChange({
                ...draft,
                model: slug,
                contextTokens:
                    entry && entry.context > 0 ? String(entry.context) : draft.contextTokens,
            });
        },
        [catalog, preset, draft, onChange],
    );

    const chooseProvider = useCallback(
        (key: string) => {
            const next = providers.find((candidate) => candidate.key === key);

            setProvider(key);
            setDiscovered([]);
            setProbe(null);

            onChange({
                ...draft,
                baseUrl: next?.url ?? '',
                model: next?.catalog !== true && draft.model === MODEL_AUTO_FREE ? '' : draft.model,
            });
        },
        [providers, draft, onChange],
    );

    const test = useCallback(async () => {
        if (url === '') {
            return;
        }

        setProbe('testing');

        try {
            const result = await modelProbe(
                teamId,
                url,
                apiKey,
                draft.model.trim(),
                mode === 'edit' ? modelId : undefined,
            );

            setProbe(result);
            setDiscovered(result.ids ?? []);

            if ((result.context ?? 0) > 0) {
                onChange({ ...draft, contextTokens: String(result.context) });
            }
        } catch (cause) {
            setProbe({
                ok: false,
                reason: apiError(cause, 'models.dialog.noAnswer'),
            });
        }
    }, [teamId, url, apiKey, draft, onChange, mode, modelId]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85dvh] overflow-y-auto">
                <Stack
                    direction="Vertical"
                    as="form"
                    className="gap-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit(url);
                    }}>
                    <DialogHeader>
                        <DialogTitle>
                            {mode === 'create'
                                ? t('models.dialog.createTitle')
                                : t('models.dialog.editTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {mode === 'create'
                                ? t('models.dialog.createDescription')
                                : t('models.dialog.editDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <Suggestions
                        id="catalog-models"
                        options={catalog.map((entry) => ({
                            value: entry.id,
                            label:
                                entry.prompt === 0 && entry.completion === 0
                                    ? t('models.dialog.catalogFree', { name: entry.name })
                                    : t('models.dialog.catalogPrice', {
                                          name: entry.name,
                                          prompt: String(entry.prompt),
                                          completion: String(entry.completion),
                                      }),
                        }))}
                    />

                    <Suggestions
                        id="endpoint-models"
                        options={suggestions.map((id) => ({ value: id }))}
                    />

                    {mode === 'create' && (
                        <Field
                            label={t('models.dialog.provider')}
                            hint={
                                preset === undefined || preset.hint === ''
                                    ? undefined
                                    : providerText(preset.key, 'hint', preset.hint)
                            }>
                            {(id) => (
                                <Select
                                    value={preset?.key ?? ''}
                                    onValueChange={(key) => void chooseProvider(key)}
                                    id={id}
                                    placeholder={t('models.dialog.providerPlaceholder')}>
                                    {providers.map((entry) => (
                                        <SelectItem key={entry.key} value={entry.key}>
                                            {providerText(entry.key, 'label', entry.label)}
                                        </SelectItem>
                                    ))}
                                </Select>
                            )}
                        </Field>
                    )}

                    <Field label={t('models.dialog.name')} hint={t('models.dialog.nameHint')}>
                        {(id) => (
                            <Input
                                id={id}
                                value={draft.name}
                                onChange={(event) =>
                                    onChange({ ...draft, name: event.target.value })
                                }
                                minLength={2}
                                maxLength={64}
                                required
                                placeholder={t('models.dialog.namePlaceholder')}
                            />
                        )}
                    </Field>

                    {openRouter && (
                        <Field
                            label={t('models.dialog.autoFree')}
                            hint={t('models.dialog.autoFreeHint')}>
                            {(id) => (
                                <Switch
                                    id={id}
                                    checked={autoFree}
                                    onCheckedChange={(on) =>
                                        onChange({
                                            ...draft,
                                            model: on ? MODEL_AUTO_FREE : '',
                                            contextTokens: on ? '' : draft.contextTokens,
                                        })
                                    }
                                />
                            )}
                        </Field>
                    )}

                    {!autoFree && (
                        <Field label={t('models.dialog.model')} hint={modelHint}>
                            {(id) => (
                                <Input
                                    id={id}
                                    value={draft.model}
                                    onChange={(event) => chooseModel(event.target.value)}
                                    maxLength={128}
                                    required
                                    list={listId}
                                    className="font-mono"
                                    placeholder="anthropic/claude-sonnet-4.5"
                                />
                            )}
                        </Field>
                    )}

                    {!usesCatalog && (
                        <Field label={t('models.dialog.endpoint')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    type="url"
                                    value={draft.baseUrl}
                                    onChange={(event) =>
                                        onChange({ ...draft, baseUrl: event.target.value })
                                    }
                                    maxLength={256}
                                    required
                                    className="font-mono"
                                    placeholder="https://api.openai.com/v1"
                                />
                            )}
                        </Field>
                    )}

                    {!autoFree && (
                        <Field
                            label={t('models.dialog.context')}
                            hint={t('models.dialog.contextHint')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    type="number"
                                    min={0}
                                    value={draft.contextTokens}
                                    onChange={(event) =>
                                        onChange({ ...draft, contextTokens: event.target.value })
                                    }
                                    className="font-mono"
                                    placeholder={t('models.dialog.contextPlaceholder')}
                                />
                            )}
                        </Field>
                    )}

                    <Field
                        label={
                            mode === 'edit'
                                ? t('models.dialog.replacementKey')
                                : t('models.dialog.apiKey')
                        }
                        hint={
                            mode === 'edit'
                                ? t('models.dialog.replacementKeyHint')
                                : preset?.key_required === true
                                  ? undefined
                                  : t('models.dialog.localKeyHint')
                        }>
                        {(id) => (
                            <Input
                                id={id}
                                type="password"
                                autoComplete="off"
                                spellCheck={false}
                                value={draft.apiKey}
                                onChange={(event) =>
                                    onChange({ ...draft, apiKey: event.target.value })
                                }
                                maxLength={256}
                                required={mode === 'create' && preset?.key_required === true}
                                placeholder="sk-…"
                            />
                        )}
                    </Field>

                    {probe !== null && (
                        <Text
                            type="Body"
                            as="output"
                            className={PROBE_TONE[probeState(probe)]}
                            message={probeLabel(probe, autoFree)}
                        />
                    )}

                    {error !== null && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <DialogFooter align="between">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={probe === 'testing' || url === ''}
                            onClick={() => void test()}
                            message={
                                probe === 'testing'
                                    ? t('models.dialog.testing')
                                    : t('models.dialog.test')
                            }
                        />

                        <Stack direction="Horizontal" className="gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                message={t('models.dialog.cancel')}
                            />
                            <Button
                                type="submit"
                                disabled={busy}
                                message={
                                    busy
                                        ? t('models.dialog.saving')
                                        : mode === 'create'
                                          ? t('models.dialog.add')
                                          : t('models.dialog.save')
                                }
                            />
                        </Stack>
                    </DialogFooter>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
