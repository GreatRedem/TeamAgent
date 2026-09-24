import { useCallback, useState } from 'react';

import { type AgentDocument, agentDocumentRemove, agentDocumentUpdate } from '@/apis';
import { ConfirmButton } from '@/components/confirm-button';
import { tokenLabel } from '@/libs/format';
import { apiError, t } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';
import { Textarea } from '@/ui/textarea';

function alwaysSent(name: string, content: string): boolean {
    return name === 'instructions.md' || name === 'guardrails.md' || content.trim().length <= 400;
}

export function DocumentEditor({
    teamId,
    agentId,
    document,
    onSaved,
    onRemoved,
}: {
    teamId: number;
    agentId: number;
    document: AgentDocument;
    onSaved: (document: AgentDocument) => void;
    onRemoved: (id: number) => void;
}) {
    const [content, setContent] = useState(document.content);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const dirty = content !== document.content;
    const always = alwaysSent(document.name, content);

    const save = useCallback(async () => {
        setError(null);
        setBusy(true);

        try {
            onSaved(
                await agentDocumentUpdate(teamId, agentId, document.id, document.name, content),
            );
        } catch (cause) {
            setError(apiError(cause, 'agents.errors.fileSaveFailed'));
        } finally {
            setBusy(false);
        }
    }, [teamId, agentId, document.id, document.name, content, onSaved]);

    const remove = useCallback(async () => {
        try {
            await agentDocumentRemove(teamId, agentId, document.id);

            onRemoved(document.id);
        } catch (cause) {
            setError(apiError(cause, 'agents.errors.fileRemoveFailed'));
        }
    }, [teamId, agentId, document.id, onRemoved]);

    return (
        <Card gap={4}>
            <CardHeader>
                <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                    <Text type="DataBody" as="span" className="truncate" message={document.name} />

                    {dirty && <Badge variant="warning">{t('agents.document.unsaved')}</Badge>}
                </CardTitle>

                <Stack
                    direction="Horizontal"
                    className="col-start-2 row-span-2 row-start-1 items-center gap-2 self-start justify-self-end">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !dirty}
                        onClick={() => void save()}
                        message={busy ? t('agents.document.saving') : t('agents.document.save')}
                    />

                    <ConfirmButton
                        label={t('agents.document.delete')}
                        title={t('agents.document.deleteTitle', { name: document.name })}
                        description={t('agents.document.deleteDescription')}
                        confirmLabel={t('agents.document.deleteConfirm')}
                        onConfirm={() => void remove()}
                    />
                </Stack>
            </CardHeader>

            <CardContent className="grid gap-2">
                <Textarea
                    variant="code"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    spellCheck={false}
                />

                <Text
                    type="Caption"
                    message={t(always ? 'agents.document.alwaysSent' : 'agents.document.onDemand', {
                        tokens: tokenLabel(content),
                    })}
                />

                {error !== null && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
}
