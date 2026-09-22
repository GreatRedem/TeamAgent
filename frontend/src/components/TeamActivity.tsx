import { useCallback, useEffect, useState } from 'react';

import { ApiError, auditList, type AuditEntry, type Paged } from '../lib/api';
import { MonoLabel } from './MonoLabel';
import { PaginationFooter } from './PaginationFooter';
import { Panel, PageHead } from './Panel';

interface TeamActivityProps
{
    teamId: number;
}

/**
 * What a model round-trip's audit entry says about itself, read back out of
 * the `detail` string the reply path writes:
 *
 *   agent 3 (support) · model 2 (openrouter/auto) · profile 9 · 14 messages in · 318 chars out · 1 tool call(s)
 *
 * Each field is matched on its own, because the failure variants drop some
 * of them (`model 2 unreachable`, `... - reason`) and keep the rest.
 *
 * ponytail: parsed from prose. The honest source is `team_agent_exchange`,
 * which has these as columns but is only served per agent today; a team-wide
 * exchange endpoint replaces this parser and adds real token counts.
 */
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

/** OK is live, a failure is rust, a stand-down is brass -- one meaning each. */
const RESULT: Record<AuditEntry['outcome'], { label: string; className: string }> = {
    ok: { label: 'OK', className: 'text-live' },
    error: { label: 'FAILED', className: 'text-fail' },
    skipped: { label: 'SKIPPED', className: 'text-pending' }
};

const COLUMNS = 'grid grid-cols-[0.8fr_1fr_0.6fr_0.8fr] gap-3 px-[18px] md:grid-cols-[0.7fr_0.8fr_1.3fr_0.9fr_0.6fr_0.8fr]';

/** Time of day in the row; the date is in the detail panel where there is room. */
function clock(iso: string): string
{
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const FILTER = 'inline-flex h-11 items-center gap-[7px] rounded-control border px-3.5 text-[13px] lg:h-[34px]';

/**
 * The trail, newest first, with one row open beside it.
 *
 * Every row is an audit entry. Model round-trips read their agent, model and
 * sizes out of the entry; everything else shows who did what to what. One
 * source, one footer -- the reference draws round-trips and the trail as two
 * lists because they come from two tables, and only one is served team-wide.
 *
 * "Failures only" narrows the rows on screen. It is a permanent control, not
 * a menu item, and it says how many of this page's rows it kept because the
 * footer still counts the whole trail.
 */
export function TeamActivity({ teamId }: TeamActivityProps)
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

    // The newest row is open until another is picked, so the panel is never
    // empty while there is something to show.
    const selected = rows.find((entry) => entry.id === selectedId) ?? rows[0] ?? null;
    const trip = selected === null ? null : roundTrip(selected);

    return (
        <>
            <PageHead
                title="Activity"
                sub="What was sent, what came back, how long it took."
                actions={ (
                    <fieldset className="m-0 flex gap-2 border-0 p-0">
                        <legend className="sr-only">Filter</legend>

                        <button
                            className={ `${ FILTER } ${ failuresOnly ? 'border-edge-strong bg-transparent text-ink-2 hover:text-ink' : 'border-edge-strong bg-raised font-medium text-ink' }` }
                            type="button"
                            aria-pressed={ !failuresOnly }
                            onClick={ () => setFailuresOnly(false) }
                        >
                            All
                        </button>

                        <button
                            className={ `${ FILTER } border-fail-edge text-fail ${ failuresOnly ? 'bg-fail-wash font-medium' : 'bg-transparent hover:bg-fail-wash' }` }
                            type="button"
                            aria-pressed={ failuresOnly }
                            onClick={ () => setFailuresOnly(true) }
                        >
                            <span className="size-1.5 rounded-full bg-fail" aria-hidden="true" />
                            Failures only
                        </button>
                    </fieldset>
                ) }
            />

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <Panel
                    flush
                    aria-label="Audit trail"
                    footer={ page !== null && entries !== null && (
                        <PaginationFooter page={ page } shown={ entries.length } busy={ paging } noun="entries" onPage={ (offset) => void goTo(offset) } />
                    ) }
                >
                    <div className={ `${ COLUMNS } border-b border-edge-soft py-3` } aria-hidden="true">
                        <MonoLabel>Time</MonoLabel>
                        <MonoLabel>Who</MonoLabel>
                        <MonoLabel className="hidden md:block">What</MonoLabel>
                        <MonoLabel className="hidden md:block">In / out</MonoLabel>
                        <MonoLabel>ms</MonoLabel>
                        <MonoLabel>Result</MonoLabel>
                    </div>

                    { error !== null && <p className="note px-4" data-state="error" role="alert">{ error }</p> }

                    { entries === null && error === null && <p className="note px-4 pb-4">Loading activity...</p> }

                    { entries !== null && entries.length === 0 && <p className="note px-4 pb-4">Nothing recorded yet.</p> }

                    { entries !== null && failuresOnly && (
                        <p className="m-0 border-b border-edge-row px-[18px] py-2 font-mono text-[11px] text-ink-3">
                            { rows.length } of { entries.length } on this page failed
                        </p>
                    ) }

                    { rows.map((entry) =>
                    {
                        const row = roundTrip(entry);
                        const result = RESULT[entry.outcome];
                        const open = selected?.id === entry.id;

                        return (
                            <button
                                key={ entry.id }
                                className={ `${ COLUMNS } w-full cursor-pointer items-center border-b border-edge-row py-[13px] text-start font-mono text-xs last:border-b-0 hover:bg-panel-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live ${ open ? 'bg-panel-hover' : '' }` }
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
                    className="xl:sticky xl:top-24"
                    title={ selected === null ? 'Nothing selected' : `${ trip === null ? selected.action : 'Round-trip' } ${ clock(selected.created_at) }` }
                    actions={ selected !== null && selected.duration_ms > 0 && (
                        <span className={ `font-mono text-[11px] ${ selected.outcome === 'error' ? 'text-fail' : 'text-live' }` }>
                            { selected.duration_ms.toLocaleString() } MS
                        </span>
                    ) }
                >
                    { selected === null && <p className="note mt-0">Pick a row to see what was sent and what came back.</p> }

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

                            { /* The three-part queue / tool / model bar needs timings the
                                 trail does not keep; only the total is recorded. */ }
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
        </>
    );
}
