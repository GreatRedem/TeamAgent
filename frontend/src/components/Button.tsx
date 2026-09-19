import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Link } from 'react-router';

interface CommonProps
{
    children: ReactNode;
    icon?: ReactNode;
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

/** The primary action: white surface, dark label, icon to the left. */
export function Button({ children, icon, className, ...rest }: ButtonProps)
{
    return (
        <button className={ [ 'button', className ].filter(Boolean).join(' ') } { ...rest }>
            { icon !== undefined && <span className="button__icon">{ icon }</span> }
            <span className="button__label">{ children }</span>
        </button>
    );
}

interface ButtonLinkProps extends CommonProps
{
    to: string;
}

/** Same surface as `Button`, rendered as a router link. */
export function ButtonLink({ children, icon, to }: ButtonLinkProps)
{
    return (
        <Link className="button" to={ to }>
            { icon !== undefined && <span className="button__icon">{ icon }</span> }
            <span className="button__label">{ children }</span>
        </Link>
    );
}
