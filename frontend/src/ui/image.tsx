import type * as React from 'react';

function Image({ alt, ...props }: React.ComponentProps<'img'> & { alt: string }) {
    return <img data-slot="image" alt={alt} {...props} />;
}

export { Image };
