import type * as React from 'react';

import { buttonVariants } from '@/ui/button';
import { Text } from '@/ui/text';

function FileInput({
    choose,
    empty,
    file,
    onFile,
    ...props
}: Omit<React.ComponentProps<'input'>, 'type' | 'className' | 'onChange' | 'value' | 'children'> & {
    choose: string;
    empty: string;
    file: File | null;
    onFile: (file: File | null) => void;
}) {
    return (
        <label
            data-slot="file-input"
            className="flex h-9 w-full min-w-0 cursor-pointer items-center gap-3 rounded-md border border-input bg-transparent ps-1 pe-3 shadow-xs transition-[color,box-shadow] has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50 dark:bg-input/30">
            <input
                type="file"
                className="sr-only"
                onChange={(event) => onFile(event.target.files?.[0] ?? null)}
                {...props}
            />
            <span className={buttonVariants({ variant: 'secondary', size: 'xs' })}>{choose}</span>
            {file === null ? (
                <Text type="BodyMuted" as="span" className="truncate" message={empty} />
            ) : (
                <Text type="DataBody" as="span" className="truncate" message={file.name} />
            )}
        </label>
    );
}

export { FileInput };
