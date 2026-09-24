import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/libs/cn';
import { t } from '@/libs/i18n';
import { type Button, buttonVariants } from '@/ui/button';

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
    return <nav data-slot="pagination" className={cn('flex', className)} {...props} />;
}

function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
    return (
        <ul
            data-slot="pagination-content"
            className={cn('flex flex-row items-center gap-1', className)}
            {...props}
        />
    );
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
    return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = {
    isActive?: boolean;
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
    React.ComponentProps<'a'>;

function PaginationLink({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) {
    return (
        <a
            data-slot="pagination-link"
            data-active={isActive}
            className={cn(
                buttonVariants({
                    variant: isActive ? 'outline' : 'ghost',
                    size,
                }),
                className,
            )}
            {...props}
        />
    );
}

function PaginationPrevious({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
    return (
        <PaginationLink
            size="default"
            className={cn('gap-1 px-2.5 sm:ps-2.5', className)}
            {...props}>
            <ChevronLeftIcon className="rtl:-scale-x-100" />
            <span className="hidden sm:block">{t('common.previous')}</span>
        </PaginationLink>
    );
}

function PaginationNext({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
    return (
        <PaginationLink
            size="default"
            className={cn('gap-1 px-2.5 sm:pe-2.5', className)}
            {...props}>
            <span className="hidden sm:block">{t('common.next')}</span>
            <ChevronRightIcon className="rtl:-scale-x-100" />
        </PaginationLink>
    );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            data-slot="pagination-ellipsis"
            className={cn('flex size-9 items-center justify-center', className)}
            {...props}>
            <MoreHorizontalIcon className="size-4" />
            <span className="sr-only">{t('common.morePages')}</span>
        </span>
    );
}

export {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
};
