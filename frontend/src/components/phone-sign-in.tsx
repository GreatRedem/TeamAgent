import { MessageSquareText } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { smsSend, smsSignIn } from '@/apis';
import { Field } from '@/components/field';
import { SMS_CODE_LENGTH } from '@/libs/constant';
import { apiError, locale, t } from '@/libs/i18n';
import { writeAccessToken } from '@/libs/session';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Stack } from '@/ui/stack';

export function PhoneSignIn() {
    const navigate = useNavigate();

    const [phone, setPhone] = useState('');
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [wait, setWait] = useState(0);

    useEffect(() => {
        if (wait <= 0) {
            return;
        }

        const timer = setTimeout(() => setWait(wait - 1), 1000);

        return () => clearTimeout(timer);
    }, [wait]);

    const sendCode = async (event?: FormEvent) => {
        event?.preventDefault();

        setBusy(true);
        setError(null);

        try {
            const sent = await smsSend(phone.trim(), locale);

            setSentTo(sent.phone);
            setWait(sent.resend_after);
            setCode('');
        } catch (cause) {
            setError(apiError(cause, 'auth.phone.sendFailed'));
        } finally {
            setBusy(false);
        }
    };

    const verify = async (event: FormEvent) => {
        event.preventDefault();

        if (sentTo === null) {
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const { accessToken } = await smsSignIn(sentTo, code.trim());

            writeAccessToken(accessToken);

            await navigate('/dashboard', { replace: true });
        } catch (cause) {
            setError(apiError(cause, 'auth.errors.signInFailed'));
            setBusy(false);
        }
    };

    const failure = error !== null && (
        <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
        </Alert>
    );

    if (sentTo === null) {
        return (
            <Stack
                direction="Vertical"
                as="form"
                className="gap-5"
                key="phone"
                onSubmit={(event) => void sendCode(event)}>
                <Field label={t('auth.phone.label')} hint={t('auth.phone.hint')}>
                    {(id) => (
                        <Input
                            id={id}
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            dir="ltr"
                            required
                            value={phone}
                            disabled={busy}
                            onChange={(event) => setPhone(event.target.value)}
                            maxLength={32}
                            placeholder={t('auth.phone.placeholder')}
                        />
                    )}
                </Field>

                {failure}

                <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={busy || phone.trim() === ''}
                    icon={<MessageSquareText />}
                    message={busy ? t('auth.phone.sending') : t('auth.phone.send')}
                />
            </Stack>
        );
    }

    return (
        <Stack
            direction="Vertical"
            as="form"
            className="gap-5"
            key="code"
            onSubmit={(event) => void verify(event)}>
            <Field
                label={t('auth.phone.codeLabel')}
                hint={t('auth.phone.codeHint', { phone: sentTo })}>
                {(id) => (
                    <Input
                        id={id}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        dir="ltr"
                        required
                        value={code}
                        disabled={busy}
                        onChange={(event) => setCode(event.target.value)}
                        maxLength={SMS_CODE_LENGTH}
                    />
                )}
            </Field>

            {failure}

            <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={busy || code.trim().length < SMS_CODE_LENGTH}
                message={busy ? t('auth.phone.checking') : t('auth.phone.verify')}
            />

            <Stack direction="Horizontal" className="flex-wrap justify-between gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                        setSentTo(null);
                        setError(null);
                    }}
                    message={t('auth.phone.change')}
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy || wait > 0}
                    onClick={() => void sendCode()}
                    message={
                        wait > 0
                            ? t('auth.phone.resendIn', { seconds: wait })
                            : t('auth.phone.resend')
                    }
                />
            </Stack>
        </Stack>
    );
}
