import { Download, Upload } from 'lucide-react';
import { useState } from 'react';

import { type ImportReport, teamExport, teamImport } from '@/apis';
import { Field } from '@/components/field';
import { TRANSFER_LABELS, TRANSFER_UPLOAD_MAX } from '@/libs/constant';
import { numberLabel } from '@/libs/format';
import { apiError, locale, t } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { Input } from '@/ui/input';
import { saveFile } from '@/ui/save-file';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

function counted(counts: Record<string, number>): string {
    return new Intl.ListFormat(locale, { type: 'conjunction', style: 'narrow' }).format(
        Object.entries(counts)
            .filter(([, count]) => count > 0)
            .map(
                ([key, count]) =>
                    `${numberLabel(count)} ${TRANSFER_LABELS[key] === undefined ? key : t(TRANSFER_LABELS[key])}`,
            ),
    );
}

export function TransferCard({ teamId }: { teamId: number }) {
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [report, setReport] = useState<ImportReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    const download = async () => {
        setError(null);
        setExporting(true);

        try {
            const exported = await teamExport(teamId);

            saveFile(exported.file, exported.name);
        } catch (cause) {
            setError(apiError(cause, 'projects.transfer.errors.exportFailed'));
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
            setError(t('projects.transfer.tooLarge'));

            return;
        }

        setImporting(true);

        try {
            setReport(await teamImport(teamId, file));
        } catch (cause) {
            setError(apiError(cause, 'projects.transfer.errors.importFailed'));
        } finally {
            setImporting(false);
        }
    };

    return (
        <Card className="max-w-xl">
            <CardHeader>
                <CardTitle>{t('projects.transfer.title')}</CardTitle>
                <CardDescription>{t('projects.transfer.description')}</CardDescription>
            </CardHeader>

            <CardContent>
                <Stack direction="Vertical" className="gap-5">
                    <Stack direction="Horizontal">
                        <Button
                            variant="outline"
                            icon={<Download />}
                            disabled={exporting}
                            onClick={() => void download()}
                            message={
                                exporting
                                    ? t('projects.transfer.exporting')
                                    : t('projects.transfer.export')
                            }
                        />
                    </Stack>

                    <Stack direction="Vertical" as="form" className="gap-3" onSubmit={upload}>
                        <Field
                            label={t('projects.transfer.importLabel')}
                            hint={t('projects.transfer.importHint')}>
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
                                message={
                                    importing
                                        ? t('projects.transfer.importing')
                                        : t('projects.transfer.import')
                                }
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
                                        message={
                                            counted(report.imported) === ''
                                                ? report.from === ''
                                                    ? t('projects.transfer.report.nothingFromZip')
                                                    : t('projects.transfer.report.nothing', {
                                                          from: report.from,
                                                      })
                                                : report.from === ''
                                                  ? t('projects.transfer.report.addedFromZip', {
                                                        items: counted(report.imported),
                                                    })
                                                  : t('projects.transfer.report.added', {
                                                        from: report.from,
                                                        items: counted(report.imported),
                                                    })
                                        }
                                    />
                                    {counted(report.skipped) !== '' && (
                                        <Text
                                            type="BodyMuted"
                                            message={t('projects.transfer.report.skipped', {
                                                items: counted(report.skipped),
                                            })}
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
