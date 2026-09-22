import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Link } from 'react-router';

interface CommonProps
{
    children: ReactNode;
    icon?: ReactNode;
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * The primary action.
 *
 * A raised grey, not the teal: `live` is the interface's signal colour -- it
 * marks what is live, granted or healthy -- and spending it on every submit
 * button would leave nothing to say "this one". The primary action earns its
 * weight from being the only solid button on the screen.
 */
const BASE = 'btn btn--solid';

export function Button({ children, icon, className, ...rest }: ButtonProps)
{
    return (
        <button className={ [ BASE, className ].filter(Boolean).join(' ') } { ...rest }>
            { icon !== undefined && <span className="opacity-75">{ icon }</span> }
            { children }
        </button>
    );
}

interface ButtonLinkProps extends CommonProps
{
    to: string;
}

/** The same surface, rendered as a router link. */
export function ButtonLink({ children, icon, to }: ButtonLinkProps)
{
    return (
        <Link className={ BASE } to={ to }>
            { icon !== undefined && <span className="opacity-75">{ icon }</span> }
            { children }
        </Link>
    );
}
