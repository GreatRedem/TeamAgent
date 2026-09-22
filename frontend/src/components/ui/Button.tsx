import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Link } from 'react-router';

import { CLASS_BUTTON } from '../../lib/constant';

interface CommonProps
{
    children: ReactNode;
    icon?: ReactNode;
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ children, icon, className, ...rest }: ButtonProps)
{
    return (
        <button className={ [ CLASS_BUTTON, className ].filter(Boolean).join(' ') } { ...rest }>
            { icon !== undefined && <span className="opacity-75">{ icon }</span> }
            { children }
        </button>
    );
}

export function ButtonLink({ children, icon, to }: CommonProps & { to: string })
{
    return (
        <Link className={ CLASS_BUTTON } to={ to }>
            { icon !== undefined && <span className="opacity-75">{ icon }</span> }
            { children }
        </Link>
    );
}
