import { useCallback, useState } from 'react';
import { cn } from 'cn';

import { ApiError, modelProbe, type CatalogModel, type ProviderPreset, type TeamModelProbe } from '@/api';
import { PROBE_TONE } from '@/lib/constant';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface ModelDraft
{
    name: string;
    model: string;
    baseUrl: string;
    apiKey: string;
    contextTokens: string;
}

function probeState(probe: TeamModelProbe | 'testing'): string
{
    if (probe === 'testing')
    {
        return 'pending';
    }

    return probe.ok ? 'ok' : 'error';
}

function probeLabel(probe: TeamModelProbe | 'testing'): string
{
    if (probe === 'testing')
    {
        return 'Asking the endpoint…';
    }

    if (!probe.ok)
    {
        return probe.reason ?? 'The endpoint did not answer.';
    }

    const found = probe.found === true ? 'your model is available' : 'your model is not in its listing';
    const context = (probe.context ?? 0) > 0 ? `, ${ probe.context?.toLocaleString() } token window` : '';

    return `Connected. ${ probe.models ?? 0 } models offered, ${ found }${ context }.`;
}

export function ModelDialog({ open, mode, teamId, draft, providers, catalog, catalogUrl, busy, error, onChange, onOpenChange, onSubmit }: {
    open: boolean;
    mode: 'create' | 'edit';
    teamId: number;
    draft: ModelDraft;
    providers: ProviderPreset[];
    catalog: CatalogModel[];
    catalogUrl: string;
    busy: boolean;
    error: string | null;
    onChange: (draft: ModelDraft) => void;
    onOpenChange: (open: boolean) => void;
    onSubmit: (url: string) => void;
})
{
    const [ provider, setProvider ] = useState('');
    const [ discovered, setDiscovered ] = useState<string[]>([ ]);
    const [ probe, setProbe ] = useState<TeamModelProbe | 'testing' | null>(null);

    const preset = providers.find((candidate) => candidate.key === provider) ?? providers[0];
    const usesCatalog = mode === 'create' && preset?.catalog === true;
    const url = usesCatalog ? catalogUrl : draft.baseUrl.trim();

    const suggestions = discovered.length > 0 ? discovered : (preset?.models ?? [ ]).map((entry) => entry.id);
    const listId = mode === 'create' && usesCatalog ? 'catalog-models' : suggestions.length > 0 ? 'endpoint-models' : undefined;

    const chooseModel = useCallback((slug: string) =>
    {
        const entry = catalog.find((candidate) => candidate.id === slug.trim())
            ?? preset?.models.find((candidate) => candidate.id === slug.trim());

        onChange({
            ...draft,
            model: slug,
            contextTokens: entry && entry.context > 0 ? String(entry.context) : draft.contextTokens
        });
    }, [ catalog, preset, draft, onChange ]);

    const chooseProvider = useCallback(async(key: string) =>
    {
        const next = providers.find((candidate) => candidate.key === key);

        setProvider(key);
        setDiscovered([ ]);
        setProbe(null);

        onChange({ ...draft, baseUrl: next?.url ?? '' });

        if (next !== undefined && next.url !== '' && !next.catalog)
        {
            try
            {
                setDiscovered((await modelProbe(teamId, next.url, draft.apiKey.trim(), '')).ids ?? [ ]);
            }
            catch
            {
                setDiscovered([ ]);
            }
        }
    }, [ providers, draft, onChange, teamId ]);

    const test = useCallback(async() =>
    {
        if (url === '')
        {
            return;
        }

        setProbe('testing');

        try
        {
            const result = await modelProbe(teamId, url, draft.apiKey.trim(), draft.model.trim());

            setProbe(result);
            setDiscovered(result.ids ?? [ ]);

            if ((result.context ?? 0) > 0)
            {
                onChange({ ...draft, contextTokens: String(result.context) });
            }
        }
        catch (cause)
        {
            setProbe({ ok: false, reason: cause instanceof ApiError ? cause.result : 'The endpoint did not answer.' });
        }
    }, [ teamId, url, draft, onChange ]);

    return (
        <Dialog open={ open } onOpenChange={ onOpenChange }>
            <DialogContent className="max-h-[85dvh] overflow-y-auto">
                <form
                    className="grid gap-5"
                    onSubmit={ (event) => { event.preventDefault(); onSubmit(url); } }
                >
                    <DialogHeader>
                        <DialogTitle>{ mode === 'create' ? 'Add a model' : 'Edit model' }</DialogTitle>
                        <DialogDescription>
                            { mode === 'create'
                                ? 'Any OpenAI-compatible endpoint works. Test the connection before you save.'
                                : 'Leave the key blank to keep the one already stored.' }
                        </DialogDescription>
                    </DialogHeader>

                    <datalist id="catalog-models">
                        { catalog.map((entry) => (
                            <option key={ entry.id } value={ entry.id }>
                                { entry.name }
                                { entry.prompt === 0 && entry.completion === 0 ? ' · free' : ` · $${ entry.prompt }/$${ entry.completion } per 1M` }
                            </option>
                        )) }
                    </datalist>

                    <datalist id="endpoint-models">
                        { suggestions.map((id) => <option key={ id } value={ id } aria-label={ id } />) }
                    </datalist>

                    { mode === 'create' && (
                        <Field label="Provider" hint={ preset?.hint !== '' ? preset?.hint : undefined }>
                            { (id) => (
                                <Select value={ preset?.key ?? '' } onValueChange={ (key) => void chooseProvider(key) }>
                                    <SelectTrigger id={ id } className="w-full">
                                        <SelectValue placeholder="Pick a provider" />
                                    </SelectTrigger>

                                    <SelectContent>
                                        { providers.map((entry) => (
                                            <SelectItem key={ entry.key } value={ entry.key }>{ entry.label }</SelectItem>
                                        )) }
                                    </SelectContent>
                                </Select>
                            ) }
                        </Field>
                    ) }

                    <Field label="Name" hint="What you will call this endpoint inside Nura.">
                        { (id) => (
                            <Input
                                id={ id }
                                value={ draft.name }
                                onChange={ (event) => onChange({ ...draft, name: event.target.value }) }
                                minLength={ 2 }
                                maxLength={ 64 }
                                required
                                placeholder="Primary"
                            />
                        ) }
                    </Field>

                    <Field label="Model">
                        { (id) => (
                            <Input
                                id={ id }
                                value={ draft.model }
                                onChange={ (event) => chooseModel(event.target.value) }
                                maxLength={ 128 }
                                required
                                list={ listId }
                                className="font-mono"
                                placeholder="anthropic/claude-sonnet-4.5"
                            />
                        ) }
                    </Field>

                    { !usesCatalog && (
                        <Field label="Endpoint URL">
                            { (id) => (
                                <Input
                                    id={ id }
                                    type="url"
                                    value={ draft.baseUrl }
                                    onChange={ (event) => onChange({ ...draft, baseUrl: event.target.value }) }
                                    maxLength={ 256 }
                                    required
                                    className="font-mono"
                                    placeholder="https://api.openai.com/v1"
                                />
                            ) }
                        </Field>
                    ) }

                    <Field
                        label="Context window"
                        hint="Read from the provider when you test or save. Fill it in only for an endpoint that does not publish its own."
                    >
                        { (id) => (
                            <Input
                                id={ id }
                                type="number"
                                min={ 0 }
                                value={ draft.contextTokens }
                                onChange={ (event) => onChange({ ...draft, contextTokens: event.target.value }) }
                                className="font-mono"
                                placeholder="Detected automatically"
                            />
                        ) }
                    </Field>

                    <Field
                        label={ mode === 'edit' ? 'Replacement key' : 'API key' }
                        hint={ mode === 'edit' ? 'Leave blank to keep the stored key.' : preset?.key_required === true ? undefined : 'A local router usually needs none.' }
                    >
                        { (id) => (
                            <Input
                                id={ id }
                                type="password"
                                autoComplete="off"
                                spellCheck={ false }
                                value={ draft.apiKey }
                                onChange={ (event) => onChange({ ...draft, apiKey: event.target.value }) }
                                maxLength={ 256 }
                                required={ mode === 'create' && preset?.key_required === true }
                                placeholder="sk-…"
                            />
                        ) }
                    </Field>

                    { probe !== null && (
                        <output className={ cn('m-0 text-sm', PROBE_TONE[probeState(probe)]) }>
                            { probeLabel(probe) }
                        </output>
                    ) }

                    { error !== null && <Alert variant="destructive"><AlertDescription>{ error }</AlertDescription></Alert> }

                    <DialogFooter className="sm:justify-between">
                        <Button type="button" variant="outline" disabled={ probe === 'testing' || url === '' } onClick={ () => void test() }>
                            { probe === 'testing' ? 'Testing…' : 'Test connection' }
                        </Button>

                        <div className="flex gap-2">
                            <Button type="button" variant="ghost" onClick={ () => onOpenChange(false) }>Cancel</Button>
                            <Button type="submit" disabled={ busy }>
                                { busy ? 'Saving…' : mode === 'create' ? 'Add model' : 'Save changes' }
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
