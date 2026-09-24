import { Info } from 'lucide-react';

import type { Permission } from '@/apis';
import { capabilityText } from '@/libs/catalog';
import { t, tk } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/ui/dialog';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function CapabilityHelp({ capability }: { capability: Permission }) {
    const help = (part: string) => tk(`tools.help.${capability.key}.${part}`, '');
    const examples = [help('example1'), help('example2')].filter((example) => example !== '');
    const caution = help('caution');

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    title={t('tools.help.open')}
                    icon={<Info />}
                />
            </DialogTrigger>

            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {capabilityText(capability.key, 'label', capability.label)}
                    </DialogTitle>
                    <DialogDescription>
                        {help('summary') ||
                            capabilityText(capability.key, 'description', capability.description)}
                    </DialogDescription>
                </DialogHeader>

                {examples.length > 0 && (
                    <Stack direction="Vertical" className="gap-2">
                        <Text type="BodyStrong" message={t('tools.help.examples')} />

                        <Stack direction="Vertical" as="ul" className="m-0 list-none gap-2 p-0">
                            {examples.map((example) => (
                                <Stack
                                    direction="Vertical"
                                    as="li"
                                    className="rounded-lg border px-4 py-3"
                                    key={example}>
                                    <Text type="Body" message={example} />
                                </Stack>
                            ))}
                        </Stack>
                    </Stack>
                )}

                {caution !== '' && (
                    <Alert>
                        <AlertDescription>{caution}</AlertDescription>
                    </Alert>
                )}

                <DialogFooter showCloseButton />
            </DialogContent>
        </Dialog>
    );
}
