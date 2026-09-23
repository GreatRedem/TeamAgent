import { Download, Upload } from 'lucide-react';
import { useState } from 'react';

import { ApiError, type ImportReport, teamExport, teamImport } from '@/apis';
import { Field } from '@/components/field';
import { TRANSFER_ERRORS, TRANSFER_LABELS, TRANSFER_UPLOAD_MAX } from '@/libs/constant';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Input } from '@/ui/input';
import { saveFile } from '@/ui/save-file';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

function counted(counts: Record<string, number>): string {
    return Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${count.toLocaleString()} ${TRANSFER_LABELS[key] ?? key}`)
        .join(', ');
}

export function TransferCard({ teamId }: { teamId: number }) {
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [report, setReport] = useState<ImportReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    const failure = (cause: unknown, fallback: string) =>
        cause instanceof ApiError ? (TRANSFER_ERRORS[cause.result] ?? cause.result) : fallback;

    const download = async () => {
        setError(null);
        setExporting(true);

        try {
            const exported = await teamExport(teamId);

            saveFile(exported.file, exported.name);
        } catch (cause) {
            setError(failure(cause, 'The project could not be exported.'));
        } finally {
            setExporting(false);
        }
    };

    const upload = async (event: React.FormEvent) => {
        event.preventDefault();

        if (file === null) {
            return;
        }

        setError(null);
        setReport(null);

        if (file.size > TRANSFER_UPLOAD_MAX) {
            setError('That zip is larger than 64 MB.');

            return;
        }

        setImporting(true);

        try {
            setReport(await teamImport(teamId, file));
        } catch (cause) {
            setError(failure(cause, 'The project could not be imported.'));
        } finally {
            setImporting(false);
        }
    };

    return (
        <Card className="max-w-xl">
            <CardHeader>
                <CardTitle>Export and import</CardTitle>
                <CardDescription>
                    Save this whole project as a zip, or add one exported from another project. API
                    keys, bot tokens and plugin secrets never go into the file.
                </CardDescription>
            </CardHeader>

            <CardContent>
                <Stack direction="Vertical" className="gap-5">
                    <Stack direction="Horizontal">
                        <Button
                            variant="outline"
                            icon={<Download />}
                            disabled={exporting}
                            onClick={() => void download()}
                            message={exporting ? 'Exporting…' : 'Export project'}
                        />
                    </Stack>

                    <Stack direction="Vertical" as="form" className="gap-3" onSubmit={upload}>
                        <Field
                            label="Import a project zip"
                            hint="Everything in it is added next to what this project already has. Nothing here is changed or removed.">
                            {(id) => (
                                <Input
                                    id={id}
                                    type="file"
                                    accept=".zip,application/zip"
                                    onChange={(event) => {
                                        setFile(event.target.files?.[0] ?? null);
                                        setReport(null);
                                        setError(null);
                                    }}
                                />
                            )}
                        </Field>

                        <Stack direction="Horizontal">
                            <Button
                                type="submit"
                                icon={<Upload />}
                                disabled={file === null || importing}
                                message={importing ? 'Importing…' : 'Import'}
                            />
                        </Stack>
                    </Stack>

                    {error !== null && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {report !== null && (
                        <Alert>
                            <AlertDescription>
                                <Stack direction="Vertical" className="gap-2">
                                    <Text
                                        type="Body"
                                        message={`Added from ${report.from === '' ? 'the zip' : report.from}: ${counted(report.imported) || 'nothing new'}.`}
                                    />
                                    {counted(report.skipped) !== '' && (
                                        <Text
                                            type="BodyMuted"
                                            message={`Not added: ${counted(report.skipped)}.`}
                                        />
                                    )}
                                    {report.notes.map((note) => (
                                        <Text key={note} type="BodyMuted" message={note} />
                                    ))}
                                </Stack>
                            </AlertDescription>
                        </Alert>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
}
