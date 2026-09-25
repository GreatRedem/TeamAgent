import { type FormEvent, useState } from 'react';

import { accountPlanSet, type PlanKey, type TicketAccount } from '@/apis';
import { Field } from '@/components/field';
import { PLAN_TEXT } from '@/libs/constant';
import { apiError, t } from '@/libs/i18n';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card';
import { DataList, DataRow } from '@/ui/data-value';
import { Input } from '@/ui/input';
import { Select, SelectItem } from '@/ui/select';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function PlanControl({ account, onSaved }: { account: TicketAccount; onSaved: () => void }) {
    const [plan, setPlan] = useState<PlanKey>(account.chosen_plan);
    const [until, setUntil] = useState(account.plan_until?.slice(0, 10) ?? '');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

    const save = async (event: FormEvent) => {
        event.preventDefault();

        setBusy(true);
        setNote(null);

        try {
            await accountPlanSet(
                account.id,
                plan,
                until === '' ? null : new Date(`${until}T23:59:59`).toISOString(),
            );

            setNote({ ok: true, text: t('support.account.saved') });
            onSaved();
        } catch (cause) {
            setNote({ ok: false, text: apiError(cause, 'support.account.failed') });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('support.account.title')}</CardTitle>
                <CardDescription>
                    {t('support.account.onPlan', { plan: t(PLAN_TEXT[account.plan].name) })}
                </CardDescription>
            </CardHeader>

            <CardContent>
                <Stack direction="Vertical" className="gap-5">
                    <DataList>
                        <DataRow label={t('support.account.id')} value={`#${account.id}`} />
                        {account.phone !== null && (
                            <DataRow label={t('support.account.phone')} value={account.phone} />
                        )}
                        {account.wallet !== null && (
                            <DataRow label={t('support.account.wallet')} value={account.wallet} />
                        )}
                    </DataList>

                    <Stack
                        direction="Vertical"
                        as="form"
                        className="gap-5"
                        onSubmit={(event) => void save(event)}>
                        <Field label={t('support.account.setPlan')}>
                            {(id) => (
                                <Select
                                    id={id}
                                    value={plan}
                                    disabled={busy}
                                    onValueChange={(value) => setPlan(value as PlanKey)}>
                                    {(Object.keys(PLAN_TEXT) as PlanKey[]).map((key) => (
                                        <SelectItem key={key} value={key}>
                                            {t(PLAN_TEXT[key].name)}
                                        </SelectItem>
                                    ))}
                                </Select>
                            )}
                        </Field>

                        <Field
                            label={t('support.account.until')}
                            hint={t('support.account.untilHint')}>
                            {(id) => (
                                <Input
                                    id={id}
                                    type="date"
                                    value={until}
                                    disabled={busy}
                                    onChange={(event) => setUntil(event.target.value)}
                                />
                            )}
                        </Field>

                        {note !== null &&
                            (note.ok ? (
                                <Text type="BodyMuted" as="output" message={note.text} />
                            ) : (
                                <Alert variant="destructive">
                                    <AlertDescription>{note.text}</AlertDescription>
                                </Alert>
                            ))}

                        <Button
                            type="submit"
                            disabled={busy}
                            message={busy ? t('support.account.saving') : t('support.account.save')}
                        />
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
    );
}
