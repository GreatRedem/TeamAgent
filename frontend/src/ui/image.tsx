import type * as React from 'react';

// An image. `alt` is required: pass "" for a decorative one so screen readers skip it.
function Image({ alt, ...props }: React.ComponentProps<'img'> & { alt: string }) {
    return <img data-slot="image" alt={alt} {...props} />;
}

export { Image };
