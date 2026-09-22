import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FilePlus, FileText } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { cn } from 'cn';

import {
    ApiError,
    agentDetails,
    agentDocumentCreate,
    agentExchanges,
    agentPermissionCatalog,
    agentPermissionUpdate,
    agentUpdate,
    modelList,
    type AgentDocument,
    type AgentExchange,
    type Paged,
    type Permission,
    type TeamAgent,
    type TeamModel
} from '@/api';
import { PROBE_TONE } from '@/lib/constant';
import { teamPath } from '@/lib/navigation';
import { clearAccessToken, readAccessToken } from '@/lib/session';
import { DocumentEditor } from '@/components/agent/document-editor';
import { PermissionsPanel } from '@/components/project/permissions-panel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PaginationFooter } from '@/components/ui/pagination-footer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export function Agent()
{
    const navigate = useNavigate();

    const { id, agentId } = useParams<{ id: string; agentId: string }>();

    const teamId = Number(id);
    const thisAgent = Number(agentId);

    const idsInvalid = !Number.isInteger(teamId) || teamId < 1 || !Number.isInteger(thisAgent) || thisAgent < 1;

    const [ agent, setAgent ] = useState<TeamAgent | null>(null);
    const [ documents, setDocuments ] = useState<AgentDocument[]>([ ]);
    const [ models, setModels ] = useState<TeamModel[]>([ ]);
    const [ error, setError ] = useState<string | null>(null);

    const [ name, setName ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ modelId, setModelId ] = useState('');
    const [ savingAgent, setSavingAgent ] = useState(false);
    const [ saved, setSaved ] = useState(false);

    const [ newName, setNewName ] = useState('');
    const [ addingFile, setAddingFile ] = useState(false);

    const [ capabilities, setCapabilities ] = useState<Permission[] | null>(null);
    const [ savingCapability, setSavingCapability ] = useState<string | null>(null);
    const [ exchanges, setExchanges ] = useState<AgentExchange[]>([ ]);
    const [ exchangePage, setExchangePage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ openExchange, setOpenExchange ] = useState<number | null>(null);

    useEffect(() =>
    {
        if (readAccessToken() === null)
        {
            void navigate('/', { replace: true });

            return;
        }

        if (idsInvalid)
        {
            return;
        }

        let active = true;

        Promise.all([ agentDetails(teamId, thisAgent), modelList(teamId), agentPermissionCatalog(teamId), agentExchanges(teamId, thisAgent) ])
            .then(([ details, modelPayload, catalog, exchangePayload ]) =>
            {
                if (!active)
                {
                    return;
                }

                setAgent(details.agent);
                setDocuments(details.documents);
                setModels(modelPayload.models);
                setCapabilities(catalog.permissions);
                setExchanges(exchangePayload.exchanges);
                setExchangePage(exchangePayload);
                setName(details.agent.name);
                setDescription(details.agent.description);
                setModelId(String(details.agent.model_id));
            })
            .catch((cause: unknown) =>
            {
                if (!active)
                {
                    return;
                }

                if (cause instanceof ApiError && cause.status === 401)
                {
                    clearAccessToken();

                    void navigate('/', { replace: true });

                    return;
                }

                setError(cause instanceof ApiError ? cause.result : 'This agent could not be loaded.');
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId, thisAgent, idsInvalid, navigate ]);

    const saveAgent = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setSaved(false);
        setSavingAgent(true);

        try
        {
            setAgent(await agentUpdate(teamId, thisAgent, name.trim(), description.trim(), Number(modelId)));
            setSaved(true);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The agent could not be saved.');
        }
        finally
        {
            setSavingAgent(false);
        }
    }, [ teamId, thisAgent, name, description, modelId ]);

    const goToExchanges = useCallback(async(offset: number) =>
    {
        setPaging(true);

        try
        {
            const next = await agentExchanges(teamId, thisAgent, { offset });

            setExchanges(next.exchanges);
            setExchangePage(next);
            setOpenExchange(null);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The round-trips could not be loaded.');
        }
        finally
        {
            setPaging(false);
        }
    }, [ teamId, thisAgent ]);

    const addDocument = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setError(null);
        setAddingFile(true);

        try
        {
            const created = await agentDocumentCreate(teamId, thisAgent, newName.trim(), `# ${ newName.trim().replace(/\.md$/, '') }\n\n`);

            setDocuments((current) => [ ...current, created ].toSorted((a, b) => a.name.localeCompare(b.name)));
            setNewName('');
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The file could not be created.');
        }
        finally
        {
            setAddingFile(false);
        }
    }, [ teamId, thisAgent, newName ]);

    const toggleCapability = useCallback(async(key: string) =>
    {
        if (agent === null)
        {
            return;
        }

        const next = agent.permissions.includes(key)
            ? agent.permissions.filter((item) => item !== key)
            : [ ...agent.permissions, key ];

        setError(null);
        setSavingCapability(key);

        try
        {
            setAgent(await agentPermissionUpdate(teamId, thisAgent, next));
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The capability could not be changed.');
        }
        finally
        {
            setSavingCapability(null);
        }
    }, [ teamId, thisAgent, agent ]);

    if (idsInvalid)
    {
        return <Alert variant="destructive"><AlertDescription>That agent address is not valid.</AlertDescription></Alert>;
    }

    return (
        <>
            <PageHeader
                title={ agent?.name ?? 'Agent' }
                description={ agent === null ? 'Loading this agent.' : agent.description === '' ? 'No description yet.' : agent.description }
                actions={ (
                    <Button asChild variant="outline">
                        <Link to={ teamPath(teamId, 'agents') }>
                            <ArrowLeft aria-hidden="true" />
                            All agents
                        </Link>
                    </Button>
                ) }
            />

            { error !== null && <Alert variant="destructive"><AlertDescription>{ error }</AlertDescription></Alert> }

            { agent === null && error === null && (
                <div className="grid gap-3">
                    <Skeleton className="h-40 rounded-xl" />
                    <Skeleton className="h-64 rounded-xl" />
                </div>
            ) }

            { agent !== null && (
                <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="grid gap-6">
                        <section className="grid gap-4">
                            <div className="flex flex-wrap items-end justify-between gap-3">
                                <div className="grid gap-1">
                                    <h2 className="m-0 text-base font-semibold">Instructions</h2>
                                    <p className="m-0 text-sm text-muted-foreground">
                                        Markdown files that tell this agent how to behave.
                                    </p>
                                </div>

                                <form className="flex items-end gap-2" onSubmit={ addDocument }>
                                    <Field label="New file">
                                        { (fieldId) => (
                                            <Input
                                                id={ fieldId }
                                                className="w-48 font-mono"
                                                value={ newName }
                                                onChange={ (event) => setNewName(event.target.value) }
                                                pattern="[a-z0-9._-]+\.md"
                                                title="Lowercase name ending in .md"
                                                required
                                                placeholder="examples.md"
                                            />
                                        ) }
                                    </Field>

                                    <Button type="submit" variant="outline" disabled={ addingFile }>
                                        <FilePlus aria-hidden="true" />
                                        Add
                                    </Button>
                                </form>
                            </div>

                            { documents.length === 0 && (
                                <EmptyState
                                    icon={ FileText }
                                    title="No instructions yet"
                                    description="Create instructions.md to tell this agent who it is and how to answer."
                                />
                            ) }

                            { documents.map((document) => (
                                <DocumentEditor
                                    key={ document.id }
                                    teamId={ teamId }
                                    agentId={ thisAgent }
                                    document={ document }
                                    onSaved={ (saved_) => setDocuments((current) => current.map((item) => item.id === saved_.id ? saved_ : item)) }
                                    onRemoved={ (removedId) => setDocuments((current) => current.filter((item) => item.id !== removedId)) }
                                />
                            )) }
                        </section>

                        <Card className="gap-0 py-0">
                            <CardHeader className="border-b py-5">
                                <CardTitle>Recent round-trips</CardTitle>
                                <CardDescription>What this agent last sent to its model, and what came back.</CardDescription>
                            </CardHeader>

                            <CardContent className="px-0 py-0">
                                { exchanges.length === 0 && (
                                    <p className="m-0 px-5 py-5 text-sm text-muted-foreground">This agent has not answered anything yet.</p>
                                ) }

                                <ul className="m-0 grid list-none p-0">
                                    { exchanges.map((exchange) => (
                                        <li className="border-b last:border-b-0" key={ exchange.id }>
                                            <button
                                                type="button"
                                                className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-5 py-3 text-start hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                                                aria-expanded={ openExchange === exchange.id }
                                                onClick={ () => setOpenExchange((current) => current === exchange.id ? null : exchange.id) }
                                            >
                                                <time className="shrink-0 font-mono text-2xs text-muted-foreground" dateTime={ exchange.created_at }>
                                                    { new Date(exchange.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }
                                                </time>

                                                <span className="min-w-0 grow truncate text-sm">
                                                    Round { exchange.round }, { exchange.tool_calls } tool call{ exchange.tool_calls === 1 ? '' : 's' }
                                                </span>

                                                <span className="shrink-0 font-mono text-2xs text-muted-foreground">{ exchange.duration_ms.toLocaleString() } ms</span>

                                                <span className={ cn('shrink-0 text-sm font-medium', PROBE_TONE[exchange.outcome === 'ok' ? 'ok' : 'error']) }>
                                                    { exchange.outcome === 'ok' ? 'OK' : 'Failed' }
                                                    { exchange.reason !== '' && ` · ${ exchange.reason }` }
                                                </span>
                                            </button>

                                            { openExchange === exchange.id && (
                                                <div className="grid gap-3 bg-muted/30 px-5 py-4">
                                                    <div className="grid gap-1.5">
                                                        <p className="m-0 text-sm text-muted-foreground">Sent</p>
                                                        <pre className="m-0 max-h-64 overflow-auto rounded-md border bg-well p-3 font-mono text-2xs whitespace-pre-wrap">{ exchange.request }</pre>
                                                    </div>

                                                    <div className="grid gap-1.5">
                                                        <p className="m-0 text-sm text-muted-foreground">Came back</p>
                                                        <pre className="m-0 max-h-64 overflow-auto rounded-md border bg-well p-3 font-mono text-2xs whitespace-pre-wrap">{ exchange.response }</pre>
                                                    </div>
                                                </div>
                                            ) }
                                        </li>
                                    )) }
                                </ul>
                            </CardContent>

                            { exchangePage !== null && exchanges.length > 0 && (
                                <CardFooter className="border-t py-4">
                                    <PaginationFooter
                                        page={ exchangePage }
                                        shown={ exchanges.length }
                                        busy={ paging }
                                        noun="round-trips"
                                        onPage={ (offset) => void goToExchanges(offset) }
                                    />
                                </CardFooter>
                            ) }
                        </Card>
                    </div>

                    <div className="grid gap-6 xl:sticky xl:top-32">
                        <Card>
                            <CardHeader>
                                <CardTitle>Identity</CardTitle>
                                <CardDescription>What this agent is called and which model answers for it.</CardDescription>
                            </CardHeader>

                            <CardContent>
                                <form className="grid gap-5" onSubmit={ saveAgent }>
                                    <Field label="Name">
                                        { (fieldId) => (
                                            <Input
                                                id={ fieldId }
                                                value={ name }
                                                onChange={ (event) => { setName(event.target.value); setSaved(false); } }
                                                minLength={ 2 }
                                                maxLength={ 64 }
                                                required
                                            />
                                        ) }
                                    </Field>

                                    <Field label="What it does" hint="Optional.">
                                        { (fieldId) => (
                                            <Input
                                                id={ fieldId }
                                                value={ description }
                                                onChange={ (event) => { setDescription(event.target.value); setSaved(false); } }
                                                maxLength={ 280 }
                                            />
                                        ) }
                                    </Field>

                                    <Field label="Model">
                                        { (fieldId) => (
                                            <Select value={ modelId } onValueChange={ (value) => { setModelId(value); setSaved(false); } }>
                                                <SelectTrigger id={ fieldId } className="w-full">
                                                    <SelectValue placeholder="Pick a model" />
                                                </SelectTrigger>

                                                <SelectContent>
                                                    <SelectItem value="0">No model</SelectItem>
                                                    { models.map((model) => (
                                                        <SelectItem key={ model.id } value={ String(model.id) }>{ model.name }</SelectItem>
                                                    )) }
                                                </SelectContent>
                                            </Select>
                                        ) }
                                    </Field>

                                    <div className="flex items-center gap-3">
                                        <Button type="submit" disabled={ savingAgent }>{ savingAgent ? 'Saving…' : 'Save changes' }</Button>

                                        { saved && <output className="text-sm text-primary">Saved.</output> }
                                    </div>
                                </form>
                            </CardContent>
                        </Card>

                        <PermissionsPanel
                            title="Capabilities"
                            description="What this agent may do through the internal tools. Everything is off until you grant it."
                            catalog={ capabilities }
                            granted={ agent.permissions }
                            saving={ savingCapability }
                            error={ null }
                            onToggle={ (key) => void toggleCapability(key) }
                        />
                    </div>
                </div>
            ) }
        </>
    );
}
