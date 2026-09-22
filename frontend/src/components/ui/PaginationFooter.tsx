import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Paged } from '../../api';
import { CLASS_PAGER } from '../../lib/constant';
import { MonoLabel } from './MonoLabel';

export function PaginationFooter({ page, shown, busy = false, noun, onPage }: {
    page: Paged;
    shown: number;
    busy?: boolean;
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
                    className={ CLASS_PAGER }
                    type="button"
                    aria-label={ `Previous ${ noun }` }
                    disabled={ busy || page.offset === 0 }
                    onClick={ () => onPage(Math.max(0, page.offset - page.limit)) }
                >
                    <ChevronLeft size={ 12 } aria-hidden="true" />
                </button>

                <button
                    className={ CLASS_PAGER }
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
