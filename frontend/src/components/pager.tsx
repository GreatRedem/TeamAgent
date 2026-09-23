import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Paged } from '@/apis';
import { cn } from '@/libs/cn';
import { Button } from '@/ui/button';
import { Pagination, PaginationContent, PaginationItem } from '@/ui/pagination';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function Pager({
    page,
    shown,
    busy = false,
    noun,
    onPage,
    framed = false,
}: {
    page: Paged;
    shown: number;
    busy?: boolean;
    noun: string;
    onPage: (offset: number) => void;
    framed?: boolean;
}) {
    if (page.total === 0) {
        return null;
    }

    const from = page.offset + 1;
    const to = page.offset + shown;

    return (
        <Stack
            direction="Horizontal"
            className={cn(
                'w-full items-center justify-between gap-4',
                framed && 'rounded-lg border bg-card/90 px-4 py-2.5 shadow-raised backdrop-blur-xl',
            )}>
            <Stack direction="Horizontal" className="items-baseline gap-1" aria-live="polite">
                <Text
                    type="DataMuted"
                    as="span"
                    message={`${from.toLocaleString()}–${to.toLocaleString()}`}
                />
                <Text type="Caption" as="span" message="of" />
                <Text type="DataMuted" as="span" message={page.total.toLocaleString()} />
                <Text type="Caption" as="span" message={noun} />
            </Stack>

            <Pagination>
                <PaginationContent>
                    <PaginationItem>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Previous ${noun}`}
                            disabled={busy || page.offset === 0}
                            onClick={() => onPage(Math.max(0, page.offset - page.limit))}
                            icon={<ChevronLeft />}
                        />
                    </PaginationItem>

                    <PaginationItem>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Next ${noun}`}
                            disabled={busy || !page.has_more}
                            onClick={() => onPage(page.offset + page.limit)}
                            icon={<ChevronRight />}
                        />
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        </Stack>
    );
}
