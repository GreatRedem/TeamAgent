import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';
import { useId } from 'react';

import { cn } from '@/libs/cn';

function Tabs<T extends string>({
    tabs,
    value,
    onValueChange,
    panels,
    className,
}: {
    tabs: readonly { value: T; label: string; icon?: LucideIcon }[];
    value: T;
    onValueChange: (value: T) => void;
    panels: Record<T, React.ReactNode>;
    className?: string;
}) {
    const id = useId();

    const step = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        const last = tabs.length - 1;
        const next =
            event.key === 'ArrowRight'
                ? index === last
                    ? 0
                    : index + 1
                : event.key === 'ArrowLeft'
                  ? index === 0
                      ? last
                      : index - 1
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? last
                      : null;

        if (next === null) {
            return;
        }

        event.preventDefault();
        onValueChange(tabs[next].value);
        (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
    };

    return (
        <div data-slot="tabs" className={cn('flex flex-col gap-6', className)}>
            <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tabs.map((tab, index) => {
                    const chosen = tab.value === value;
                    const Icon = tab.icon;

                    return (
                        <button
                            key={tab.value}
                            type="button"
                            id={`${id}-${tab.value}`}
                            tabIndex={chosen ? 0 : -1}
                            onClick={() => onValueChange(tab.value)}
                            onKeyDown={(event) => step(event, index)}
                            className={cn(
                                'flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-control transition-colors',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                chosen
                                    ? 'bg-accent font-medium text-accent-foreground'
                                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                            )}>
                            {Icon !== undefined && (
                                <Icon size={16} className={chosen ? 'text-primary' : undefined} />
                            )}
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {tabs.map((tab) => (
                <div key={tab.value} id={`${id}-${tab.value}-panel`} hidden={tab.value !== value}>
                    {panels[tab.value]}
                </div>
            ))}
        </div>
    );
}

export { Tabs };
