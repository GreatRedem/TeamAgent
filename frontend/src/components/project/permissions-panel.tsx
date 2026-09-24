import { useId } from 'react';

import type { Permission } from '@/apis';
import { t } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/ui/item';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Switch } from '@/ui/switch';
import { Text } from '@/ui/text';

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
                    <Stack direction="Vertical" className="gap-2">
                        {[0, 1, 2].map((i) => (
                            <Skeleton className="h-14" key={i} />
                        ))}
                    </Stack>
                )}

                {catalog !== null && catalog.length === 0 && (
                    <Text type="BodyMuted" message={t('agents.capabilities.empty')} />
                )}

                {catalog !== null && catalog.length > 0 && (
                    <ItemGroup>
                        {catalog.map((permission) => {
                            const id = `${prefix}-${permission.key}`;

                            return (
                                <Item flush asChild key={permission.key} size="sm">
                                    <Stack direction="Horizontal" as="li">
                                        <ItemContent>
                                            <ItemTitle>
                                                <Text
                                                    type="Data"
                                                    as="label"
                                                    htmlFor={id}
                                                    message={permission.label}
                                                />
                                            </ItemTitle>

                                            <ItemDescription>
                                                {permission.description}
                                            </ItemDescription>
                                        </ItemContent>

                                        <ItemActions>
                                            <Switch
                                                id={id}
                                                checked={granted.includes(permission.key)}
                                                disabled={saving === permission.key}
                                                onCheckedChange={() => onToggle(permission.key)}
                                            />
                                        </ItemActions>
                                    </Stack>
                                </Item>
                            );
                        })}
                    </ItemGroup>
                )}
            </CardContent>
        </Card>
    );
}
