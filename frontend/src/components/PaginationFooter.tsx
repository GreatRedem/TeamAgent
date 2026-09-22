import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Paged } from '../lib/api';
import { MonoLabel } from './MonoLabel';

const PAGER = 'inline-flex size-11 items-center justify-center rounded-chip border border-edge bg-well text-ink-4 '
    + 'lg:size-7 enabled:border-edge-strong enabled:bg-raised enabled:text-ink-2 enabled:hover:text-ink disabled:cursor-not-allowed';

/**
 * The footer under every list: the range and the total (`1–12 OF 3,481`),
 * then previous and next.
 *
 * Pages replace rather than append. These lists are read to find something
 * specific -- an audit entry, a message, a person -- and a page that keeps
 * growing under the scrollbar makes what you just saw harder to get back to.
 *
 * The range is a polite live region, so a screen reader hears where the list
 * landed after a page turn rather than nothing at all. The buttons are 44px on
 * mobile and 28px in desktop list rows, the two minimums the spec sets.
 */
export function PaginationFooter({ page, shown, busy = false, noun, onPage }: {
    page: Paged;
    /** Rows actually on screen, which the last page has fewer of than `limit`. */
    shown: number;
    busy?: boolean;
    /** Plural, lowercase, in the user's words: 'models', 'messages'. */
    noun: string;
    onPage: (offset: number) => void;
})
{
    if (page.total === 0)
    {
        return null;
    }

    const from = page.offset + 1;
    const to = page.offset + shown;

    return (
        <footer className="flex items-center justify-between gap-3 border-t border-edge-soft px-4 py-2.5">
            <MonoLabel aria-live="polite">
                { from.toLocaleString() }–{ to.toLocaleString() } of { page.total.toLocaleString() }
            </MonoLabel>

            <div className="flex gap-1.5">
                <button
                    className={ PAGER }
                    type="button"
                    aria-label={ `Previous ${ noun }` }
                    disabled={ busy || page.offset === 0 }
                    onClick={ () => onPage(Math.max(0, page.offset - page.limit)) }
                >
                    <ChevronLeft size={ 12 } aria-hidden="true" />
                </button>

                <button
                    className={ PAGER }
                    type="button"
                    aria-label={ `Next ${ noun }` }
                    disabled={ busy || !page.has_more }
                    onClick={ () => onPage(page.offset + page.limit) }
                >
                    <ChevronRight size={ 12 } aria-hidden="true" />
                </button>
            </div>
        </footer>
    );
}
