import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Paged } from '@/api';
import { Button } from './button';

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
        <div className="flex w-full items-center justify-between gap-4">
            <p className="m-0 text-2xs text-muted-foreground" aria-live="polite">
                <span className="font-mono">{ from.toLocaleString() }–{ to.toLocaleString() }</span>
                { ' of ' }
                <span className="font-mono">{ page.total.toLocaleString() }</span>
                { ` ${ noun }` }
            </p>

            <div className="flex gap-1.5">
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={ `Previous ${ noun }` }
                    disabled={ busy || page.offset === 0 }
                    onClick={ () => onPage(Math.max(0, page.offset - page.limit)) }
                >
                    <ChevronLeft aria-hidden="true" />
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={ `Next ${ noun }` }
                    disabled={ busy || !page.has_more }
                    onClick={ () => onPage(page.offset + page.limit) }
                >
                    <ChevronRight aria-hidden="true" />
                </Button>
            </div>
        </div>
    );
}
