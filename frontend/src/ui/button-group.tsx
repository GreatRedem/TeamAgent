import { cn } from '@/libs/cn';
import { Separator } from '@/ui/separator';
import { Slot } from '@/ui/slot';

const buttonGroupOrientation = {
    horizontal:
        '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none',
    vertical:
        'flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none',
};

function ButtonGroup({
    className,
    orientation = 'horizontal',
    ...props
}: React.ComponentProps<'fieldset'> & { orientation?: keyof typeof buttonGroupOrientation }) {
    return (
        <fieldset
            data-slot="button-group"
            data-orientation={orientation}
            className={cn(
                'flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 [&>input]:flex-1',
                buttonGroupOrientation[orientation],
                className,
            )}
            {...props}
        />
    );
}

function ButtonGroupText({
    className,
    asChild = false,
    ...props
}: React.ComponentProps<'div'> & {
    asChild?: boolean;
}) {
    const Comp = asChild ? Slot : 'div';

    return (
        <Comp
            className={cn(
                "flex items-center gap-2 rounded-md border bg-muted px-4 text-sm leading-control font-medium shadow-xs [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            {...props}
        />
    );
}

function ButtonGroupSeparator({
    className,
    orientation = 'vertical',
    ...props
}: React.ComponentProps<typeof Separator>) {
    return (
        <Separator
            data-slot="button-group-separator"
            orientation={orientation}
            className={cn(
                'relative m-0! self-stretch bg-input data-[orientation=vertical]:h-auto',
                className,
            )}
            {...props}
        />
    );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText };
