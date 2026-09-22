import { useCallback, useEffect, useState } from 'react';
import { Bot, FileText, Plus } from 'lucide-react';
import { Link } from 'react-router';

import { ApiError, agentCreate, agentList, modelList, type Paged, type TeamAgent, type TeamModel } from '@/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PaginationFooter } from '@/components/ui/pagination-footer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export function AgentsPanel({ teamId }: { teamId: number })
{
    const [ agents, setAgents ] = useState<TeamAgent[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ models, setModels ] = useState<TeamModel[] | null>(null);

    const [ creating, setCreating ] = useState(false);
    const [ name, setName ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ modelId, setModelId ] = useState('');

    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    const [ formError, setFormError ] = useState<string | null>(null);

    useEffect(() =>
    {
        let active = true;

        Promise.all([ agentList(teamId), modelList(teamId) ])
            .then(([ agentPayload, modelPayload ]) =>
            {
                if (!active)
                {
                    return;
                }

                setAgents(agentPayload.agents);
                setPage(agentPayload);
                setModels(modelPayload.models);

                if (modelPayload.models.length > 0)
                {
                    setModelId(String(modelPayload.models[0].id));
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setAgents([ ]);
                    setModels([ ]);
                    setError(cause instanceof ApiError ? cause.result : 'The agents could not be loaded.');
                }
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId ]);

    const add = useCallback(async(event: React.FormEvent) =>
    {
        event.preventDefault();

        setFormError(null);
        setBusy(true);

        try
        {
            const agent = await agentCreate(teamId, name.trim(), description.trim(), Number(modelId));

            setAgents((current) => [ agent, ...current ?? [ ] ]);
            setPage((current) => current && { ...current, total: current.total + 1 });
            setName('');
            setDescription('');
            setCreating(false);
        }
        catch (cause)
        {
            setFormError(cause instanceof ApiError ? cause.result : 'The agent could not be created.');
        }
        finally
        {
            setBusy(false);
        }
    }, [ teamId, name, description, modelId ]);

    const goTo = useCallback(async(offset: number) =>
    {
        setPaging(true);

        try
        {
            const next = await agentList(teamId, { offset });

            setAgents(next.agents);
            setPage(next);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'The agents could not be loaded.');
        }
        finally
        {
            setPaging(false);
        }
    }, [ teamId ]);

    const hasModels = models !== null && models.length > 0;

    const createDialog = (
        <Dialog open={ creating } onOpenChange={ setCreating }>
            <DialogTrigger asChild>
                <Button disabled={ !hasModels }>
                    <Plus aria-hidden="true" />
                    New agent
                </Button>
            </DialogTrigger>

            <DialogContent>
                <form className="grid gap-5" onSubmit={ add }>
                    <DialogHeader>
                        <DialogTitle>New agent</DialogTitle>
                        <DialogDescription>An agent is a role with its own instructions, answering through one of your models.</DialogDescription>
                    </DialogHeader>

                    <Field label="Name">
                        { (id) => (
                            <Input
                                id={ id }
                                value={ name }
                                onChange={ (event) => setName(event.target.value) }
                                minLength={ 2 }
                                maxLength={ 64 }
                                required
                                placeholder="Night shift support"
                            />
                        ) }
                    </Field>

                    <Field label="What it does" hint="Optional. Shown on the agent card.">
                        { (id) => (
                            <Input
                                id={ id }
                                value={ description }
                                onChange={ (event) => setDescription(event.target.value) }
                                maxLength={ 280 }
                                placeholder="Answers billing questions out of hours"
                            />
                        ) }
                    </Field>

                    <Field label="Model">
                        { (id) => (
                            <Select value={ modelId } onValueChange={ setModelId }>
                                <SelectTrigger id={ id } className="w-full">
                                    <SelectValue placeholder="Pick a model" />
                                </SelectTrigger>

                                <SelectContent>
                                    { models?.map((model) => (
                                        <SelectItem key={ model.id } value={ String(model.id) }>
                                            { model.name }
                                            <span className="text-muted-foreground">{ model.model }</span>
                                        </SelectItem>
                                    )) }
                                </SelectContent>
                            </Select>
                        ) }
                    </Field>

                    { formError !== null && <Alert variant="destructive"><AlertDescription>{ formError }</AlertDescription></Alert> }

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={ () => setCreating(false) }>Cancel</Button>
                        <Button type="submit" disabled={ busy }>{ busy ? 'Creating…' : 'Create agent' }</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );

    return (
        <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 text-sm text-muted-foreground">
                    { agents === null ? 'Loading agents.' : `${ page?.total.toLocaleString() ?? agents.length } agent${ (page?.total ?? agents.length) === 1 ? '' : 's' } in this project.` }
                </p>

                { createDialog }
            </div>

            { error !== null && <Alert variant="destructive"><AlertDescription>{ error }</AlertDescription></Alert> }

            { models !== null && !hasModels && (
                <Alert>
                    <AlertDescription>Add a model before creating an agent. An agent always answers through one.</AlertDescription>
                </Alert>
            ) }

            { agents === null && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    { [ 0, 1, 2 ].map((i) => <Skeleton className="h-36 rounded-xl" key={ i } />) }
                </div>
            ) }

            { agents !== null && agents.length === 0 && hasModels && (
                <EmptyState
                    icon={ Bot }
                    title="No agents yet"
                    description="An agent is the role that answers. Give it a name, point it at a model, then write its instructions."
                    action={ createDialog }
                />
            ) }

            { agents !== null && agents.length > 0 && (
                <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                    { agents.map((agent) => (
                        <li key={ agent.id }>
                            <Card className="h-full gap-3 transition-colors hover:border-input">
                                <CardHeader>
                                    <CardTitle className="flex min-w-0 items-center gap-2">
                                        <Bot size={ 16 } className="shrink-0 text-primary" aria-hidden="true" />
                                        <span className="truncate">{ agent.name }</span>
                                    </CardTitle>
                                </CardHeader>

                                <CardContent className="grid gap-3">
                                    <p className="m-0 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                                        { agent.description === '' ? 'No description yet.' : agent.description }
                                    </p>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <Badge variant={ agent.model_name === '' ? 'outline' : 'secondary' } className="font-mono">
                                            { agent.model_name === '' ? 'No model' : agent.model_name }
                                        </Badge>

                                        <Badge variant="outline" className="gap-1 font-mono">
                                            <FileText size={ 11 } aria-hidden="true" />
                                            { agent.document_count }
                                        </Badge>
                                    </div>
                                </CardContent>

                                <CardFooter>
                                    <Button asChild variant="outline" size="sm" className="w-full">
                                        <Link to={ `/dashboard/team/${ teamId }/agent/${ agent.id }` }>Open agent</Link>
                                    </Button>
                                </CardFooter>
                            </Card>
                        </li>
                    )) }
                </ul>
            ) }

            { page !== null && agents !== null && agents.length > 0 && (
                <PaginationFooter page={ page } shown={ agents.length } busy={ paging } noun="agents" onPage={ (offset) => void goTo(offset) } />
            ) }
        </section>
    );
}
