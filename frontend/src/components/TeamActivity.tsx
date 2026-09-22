import { useCallback, useEffect, useState } from 'react';

import { ApiError, auditList, type AuditEntry, type Paged } from '../api';
import { AUDIT_RESULT, CLASS_AUDIT_COLUMNS, CLASS_FILTER, CLASS_NOTE, CLASS_NOTE_ERROR } from '../lib/constant';
import { MonoLabel } from './ui/MonoLabel';
import { PaginationFooter } from './ui/PaginationFooter';
import { Panel } from './ui/Panel';

function roundTrip(entry: AuditEntry): { agent: string; model: string; messages: string; chars: string; tools: string } | null
{
    if (entry.action !== 'agent.request')
    {
        return null;
    }

    const agent = /agent \d+ \((.+?)\)/.exec(entry.detail)?.[1] ?? '';
    const model = /model \d+(?: \((.+?)\))?/.exec(entry.detail)?.[1] ?? '';

    return {
        agent,
        model,
        messages: /(\d+) messages in/.exec(entry.detail)?.[1] ?? '',
        chars: /(\d+) chars out/.exec(entry.detail)?.[1] ?? '',
        tools: /(\d+) tool call/.exec(entry.detail)?.[1] ?? ''
    };
}

function clock(iso: string): string
{
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TeamActivity({ teamId }: { teamId: number })
{
    const [ entries, setEntries ] = useState<AuditEntry[] | null>(null);
    const [ page, setPage ] = useState<Paged | null>(null);
    const [ paging, setPaging ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    const [ failuresOnly, setFailuresOnly ] = useState(false);
    const [ selectedId, setSelectedId ] = useState<number | null>(null);

    useEffect(() =>
    {
        let active = true;

        auditList(teamId)
            .then((payload) =>
            {
                if (active)
                {
                    setEntries(payload.entries);
                    setPage(payload);
                }
            })
            .catch((cause: unknown) =>
            {
                if (active)
                {
                    setEntries([ ]);
                    setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
                }
            });

        return () =>
        {
            active = false;
        };
    }, [ teamId ]);

    const goTo = useCallback(async(offset: number) =>
    {
        setPaging(true);

        try
        {
            const next = await auditList(teamId, { offset });

            setEntries(next.entries);
            setPage(next);
            setSelectedId(null);
        }
        catch (cause)
        {
            setError(cause instanceof ApiError ? cause.result : 'REQUEST_FAILED');
        }
        finally
        {
            setPaging(false);
        }
    }, [ teamId ]);

    const rows = entries === null ? [ ] : failuresOnly ? entries.filter((entry) => entry.outcome === 'error') : entries;

    const selected = rows.find((entry) => entry.id === selectedId) ?? rows[0] ?? null;
    const trip = selected === null ? null : roundTrip(selected);

    return (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Panel
                flush
                aria-label="Audit trail"
                footer={ page !== null && entries !== null && (
                    <PaginationFooter page={ page } shown={ entries.length } busy={ paging } noun="entries" onPage={ (offset) => void goTo(offset) } />
                ) }
            >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge-soft px-4 py-3.5">
                    <div className="grid min-w-0 gap-1">
                        <MonoLabel>Trail</MonoLabel>
                        <h2 className="m-0 text-[15px] font-medium">What was sent, what came back</h2>
                    </div>

                    <fieldset className="m-0 flex gap-2 border-0 p-0">
                        <legend className="sr-only">Filter</legend>

                        <button
                            className={ `${ CLASS_FILTER } ${ failuresOnly ? 'border-edge-strong bg-transparent text-ink-2 hover:text-ink' : 'border-edge-strong bg-raised font-medium text-ink' }` }
                            type="button"
                            aria-pressed={ !failuresOnly }
                            onClick={ () => setFailuresOnly(false) }
                        >
                            All
                        </button>

                        <button
                            className={ `${ CLASS_FILTER } border-fail-edge text-fail ${ failuresOnly ? 'bg-fail-wash font-medium' : 'bg-transparent hover:bg-fail-wash' }` }
                            type="button"
                            aria-pressed={ failuresOnly }
                            onClick={ () => setFailuresOnly(true) }
                        >
                            <span className="size-1.5 rounded-full bg-fail" aria-hidden="true" />
                            Failures only
                        </button>
                    </fieldset>
                </div>

                <div className={ `${ CLASS_AUDIT_COLUMNS } border-b border-edge-soft py-3` } aria-hidden="true">
                    <MonoLabel>Time</MonoLabel>
                    <MonoLabel>Who</MonoLabel>
                    <MonoLabel className="hidden md:block">What</MonoLabel>
                    <MonoLabel className="hidden md:block">In / out</MonoLabel>
                    <MonoLabel>ms</MonoLabel>
                    <MonoLabel>Result</MonoLabel>
                </div>

                { error !== null && <p className={ `${ CLASS_NOTE_ERROR } p-4` } role="alert">{ error }</p> }

                { entries === null && error === null && <p className={ `${ CLASS_NOTE } p-4` }>Loading activity...</p> }

                { entries !== null && entries.length === 0 && <p className={ `${ CLASS_NOTE } p-4` }>Nothing recorded yet.</p> }

                { entries !== null && failuresOnly && (
                    <p className="m-0 border-b border-edge-row px-[18px] py-2 font-mono text-[11px] text-ink-3">
                        { rows.length } of { entries.length } on this page failed
                    </p>
                ) }

                { rows.map((entry) =>
                {
                    const row = roundTrip(entry);
                    const result = AUDIT_RESULT[entry.outcome];
                    const open = selected?.id === entry.id;

                    return (
                        <button
                            key={ entry.id }
                            className={ `${ CLASS_AUDIT_COLUMNS } w-full cursor-pointer items-center border-b border-edge-row py-[13px] text-start font-mono text-xs last:border-b-0 hover:bg-panel-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live ${ open ? 'bg-panel-hover' : '' }` }
                            type="button"
                            aria-pressed={ open }
                            onClick={ () => setSelectedId(entry.id) }
                        >
                            <span className="text-ink-2">{ clock(entry.created_at) }</span>
                            <span className={ `truncate ${ open ? 'text-ink' : 'text-ink-2' }` }>{ row !== null && row.agent !== '' ? row.agent : entry.actor }</span>
                            <span className="hidden truncate text-ink-2 md:block">{ row !== null && row.model !== '' ? row.model : entry.action }</span>
                            <span className="hidden truncate text-ink-3 md:block">
                                { row !== null && row.messages !== '' ? `${ Number(row.messages).toLocaleString() } msgs / ${ Number(row.chars).toLocaleString() } chars` : entry.target }
                            </span>
                            <span className={ entry.outcome === 'error' ? 'text-fail' : 'text-ink-2' }>{ entry.duration_ms > 0 ? entry.duration_ms.toLocaleString() : '—' }</span>
                            <span className={ result.className }>{ result.label }</span>
                        </button>
                    );
                }) }
            </Panel>

            <Panel
                className="xl:sticky xl:top-[7.5rem]"
                title={ selected === null ? 'Nothing selected' : `${ trip === null ? selected.action : 'Round-trip' } ${ clock(selected.created_at) }` }
                actions={ selected !== null && selected.duration_ms > 0 && (
                    <span className={ `font-mono text-[11px] ${ selected.outcome === 'error' ? 'text-fail' : 'text-live' }` }>
                        { selected.duration_ms.toLocaleString() } MS
                    </span>
                ) }
            >
                { selected === null && <p className={ CLASS_NOTE }>Pick a row to see what was sent and what came back.</p> }

                { selected !== null && (
                    <div className="grid gap-3.5">
                        <div className="grid gap-[7px]">
                            <MonoLabel>{ trip === null ? 'What' : 'Sent' }</MonoLabel>

                            <div className="grid gap-[5px] rounded-control border border-edge bg-well p-3 font-mono text-[11px] leading-normal">
                                { trip !== null && trip.agent !== '' && <span className="text-ink-2">agent · { trip.agent }</span> }
                                { trip !== null && trip.model !== '' && <span className="text-ink-2">model · { trip.model }</span> }
                                { trip !== null && trip.messages !== '' && <span className="text-ink-2">messages · { Number(trip.messages).toLocaleString() } in</span> }
                                { trip === null && <span className="text-ink-2">{ selected.action }{ selected.target !== '' && ` · ${ selected.target }` }</span> }
                                <span className="text-ink-3">{ selected.actor } · { new Date(selected.created_at).toLocaleString() }</span>
                            </div>
                        </div>

                        <div className="grid gap-[7px]">
                            <MonoLabel>{ trip === null ? 'Detail' : 'Came back' }</MonoLabel>

                            <div className={ `rounded-control border bg-well p-3 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere] ${ selected.outcome === 'error' ? 'border-fail-edge text-fail-text' : 'border-edge text-ink-2' }` }>
                                { trip !== null && selected.outcome === 'ok' && trip.chars !== ''
                                    ? `${ Number(trip.chars).toLocaleString() } chars of text${ trip.tools !== '' && trip.tools !== '0' ? ` after ${ trip.tools } tool call${ trip.tools === '1' ? '' : 's' }` : '' }`
                                    : selected.detail !== '' ? selected.detail : 'No detail recorded.' }
                            </div>
                        </div>

                        { selected.duration_ms > 0 && (
                            <div className="grid gap-[7px]">
                                <MonoLabel>Where the time went</MonoLabel>

                                <div className="flex h-2.5 overflow-hidden rounded-chip border border-edge bg-well" aria-hidden="true">
                                    <span className={ `grow ${ selected.outcome === 'error' ? 'bg-fail' : 'bg-live' }` } />
                                </div>

                                <div className="flex gap-3.5 font-mono text-[10px] text-ink-3">
                                    <span className={ selected.outcome === 'error' ? 'text-fail' : 'text-live' }>TOTAL { selected.duration_ms.toLocaleString() }</span>
                                    <span>queue and tool time not recorded</span>
                                </div>
                            </div>
                        ) }
                    </div>
                ) }
            </Panel>
        </div>
    );
}
