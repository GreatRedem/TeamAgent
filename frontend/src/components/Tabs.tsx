import { useCallback, useRef } from 'react';

export interface Tab
{
    id: string;
    label: string;
}

interface TabsProps
{
    tabs: Tab[];
    active: string;
    onChange: (id: string) => void;
}

/**
 * The section switcher in a panel header.
 *
 * Implements the tablist pattern rather than a row of links: arrow keys move
 * between tabs and Home/End jump to the ends, which is what a screen reader
 * user expects once the element announces itself as a tablist. Without that the
 * roles would promise behaviour the component does not have.
 *
 * The key handler sits on each tab rather than the container: the tabs are the
 * focusable elements, so that is where the event actually originates.
 */
export function Tabs({ tabs, active, onChange }: TabsProps)
{
    const list = useRef<HTMLDivElement>(null);

    const onKeyDown = useCallback((event: React.KeyboardEvent) =>
    {
        const index = tabs.findIndex((tab) => tab.id === active);

        const next = event.key === 'ArrowRight' ? index + 1
            : event.key === 'ArrowLeft' ? index - 1
                : event.key === 'Home' ? 0
                    : event.key === 'End' ? tabs.length - 1
                        : -1;

        if (next === -1)
        {
            return;
        }

        event.preventDefault();

        const target = tabs[(next + tabs.length) % tabs.length];

        onChange(target.id);

        // Focus follows selection in an automatic tablist, so the newly
        // selected tab must take the focus with it.
        list.current?.querySelector<HTMLButtonElement>(`#tab-${ target.id }`)?.focus();
    }, [ tabs, active, onChange ]);

    return (
        <div className="tabs" role="tablist" ref={ list }>
            { tabs.map((tab) => (
                <button
                    className="tabs__tab"
                    key={ tab.id }
                    id={ `tab-${ tab.id }` }
                    type="button"
                    role="tab"
                    aria-selected={ tab.id === active }
                    aria-controls={ `panel-${ tab.id }` }
                    // Only the selected tab is in the tab order; the arrow keys
                    // reach the rest.
                    tabIndex={ tab.id === active ? 0 : -1 }
                    onClick={ () => onChange(tab.id) }
                    onKeyDown={ onKeyDown }
                >
                    { tab.label }
                </button>
            )) }
        </div>
    );
}
