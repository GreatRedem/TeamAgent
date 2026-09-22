import { useCallback, useState } from 'react';

import { ApiError, agentDocumentRemove, agentDocumentUpdate, type AgentDocument } from '@/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Textarea } from '@/components/ui/textarea';
import { tokenLabel } from '@/lib/format';

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
            setError(cause instanceof ApiError ? cause.result : 'The file could not be saved.');
        } finally {
            setBusy(false);
        }
    }, [teamId, agentId, document.id, document.name, content, onSaved]);

    const remove = useCallback(async () => {
        try {
            await agentDocumentRemove(teamId, agentId, document.id);

            onRemoved(document.id);
        } catch (cause) {
            setError(cause instanceof ApiError ? cause.result : 'The file could not be removed.');
        }
    }, [teamId, agentId, document.id, onRemoved]);

    return (
        <Card className="gap-4">
            <CardHeader>
                <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm">{document.name}</span>

                    {dirty && <Badge className="bg-warning text-warning-foreground">Unsaved</Badge>}
                </CardTitle>

                <div className="col-start-2 row-span-2 row-start-1 flex items-center gap-2 self-start justify-self-end">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !dirty}
                        onClick={() => void save()}
                    >
                        {busy ? 'Saving…' : 'Save'}
                    </Button>

                    <ConfirmButton
                        label="Delete"
                        confirmLabel="Delete for good"
                        onConfirm={() => void remove()}
                    />
                </div>
            </CardHeader>

            <CardContent className="grid gap-2">
                <Textarea
                    className="min-h-56 font-mono text-2xs leading-relaxed"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    spellCheck={false}
                    aria-label={`Contents of ${document.name}`}
                />

                <p className="m-0 text-2xs text-muted-foreground">
                    {tokenLabel(content)}
                    {always
                        ? ', sent with every message this agent answers.'
                        : ', charged only when the agent opens this file.'}
                </p>

                {error !== null && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
}
