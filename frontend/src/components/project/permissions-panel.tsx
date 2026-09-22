import { useId } from 'react';

import type { Permission } from '@/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CapabilityRow } from '@/components/ui/capability-row';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function PermissionsPanel({
    title,
    description,
    catalog,
    granted,
    saving,
    error,
    onToggle,
}: {
    title: string;
    description: string;
    catalog: Permission[] | null;
    granted: string[];
    saving: string | null;
    error: string | null;
    onToggle: (key: string) => void;
}) {
    const prefix = useId();

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>

            <CardContent>
                {error !== null && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {catalog === null && (
                    <div className="grid gap-2">
                        {[0, 1, 2].map((i) => (
                            <Skeleton className="h-14" key={i} />
                        ))}
                    </div>
                )}

                {catalog !== null && catalog.length === 0 && (
                    <p className="m-0 text-sm text-muted-foreground">
                        There is nothing to grant here yet.
                    </p>
                )}

                {catalog?.map((permission) => (
                    <CapabilityRow
                        key={permission.key}
                        id={`${prefix}-${permission.key}`}
                        label={permission.label}
                        description={permission.description}
                        granted={granted.includes(permission.key)}
                        busy={saving === permission.key}
                        onToggle={() => onToggle(permission.key)}
                    />
                ))}
            </CardContent>
        </Card>
    );
}
