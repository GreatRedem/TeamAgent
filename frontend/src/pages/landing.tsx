import { ArrowRight, Languages, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';

import { accountPlans, type Plan } from '@/apis';
import { PlanLimits } from '@/components/plan-limits';
import { LANDING_FEATURES, LANDING_USES, LOCALES, PAGE_WIDTH, PLAN_TEXT } from '@/libs/constant';
import { numberLabel } from '@/libs/format';
import { chooseLocale, locale, t } from '@/libs/i18n';
import { readAccessToken } from '@/libs/session';
import { Alert, AlertDescription } from '@/ui/alert';
import { Brand } from '@/ui/brand';
import { Button } from '@/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

function PlanPrice({ price }: { price: number | null }) {
    if (price === null || price === 0) {
        return (
            <Text
                type="BodyMuted"
                message={price === null ? t('plans.price.contact') : t('plans.price.free')}
            />
        );
    }

    return (
        <Stack direction="Horizontal" className="flex-wrap items-baseline gap-x-1.5">
            <Text type="DataStrong" message={numberLabel(price)} />
            <Text type="BodyMuted" message={t('plans.price.unit')} />
        </Stack>
    );
}

function SectionHeading({ id, title, text }: { id?: string; title: string; text: string }) {
    return (
        <Stack direction="Vertical" className="gap-2" id={id}>
            <Text type="Title" as="h2" message={title} />
            <Text type="ForegroundMuted" className="max-w-[60ch]" message={text} />
        </Stack>
    );
}

export function Landing() {
    const [plans, setPlans] = useState<Plan[] | null>(null);
    const [plansFailed, setPlansFailed] = useState(false);

    const signedIn = readAccessToken() !== null;
    const other = LOCALES.find((entry) => entry.code !== locale) ?? LOCALES[0];

    useEffect(() => {
        if (signedIn) {
            return;
        }

        let active = true;

        accountPlans()
            .then((payload) => {
                if (active) {
                    setPlans(payload.plans);
                }
            })
            .catch(() => {
                if (active) {
                    setPlansFailed(true);
                }
            });

        return () => {
            active = false;
        };
    }, [signedIn]);

    if (signedIn) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <Stack direction="Vertical" className="min-h-dvh">
            <Stack
                direction="Horizontal"
                as="header"
                className={`${PAGE_WIDTH} items-center gap-2 px-4 pt-4 sm:px-6`}>
                <Brand to="/" />

                <Stack direction="Horizontal" as="span" className="grow" />

                <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => chooseLocale(other.code)}
                    icon={<Languages />}
                    message={other.name}
                />

                <Button
                    variant="outline"
                    size="sm"
                    link="/sign-in"
                    icon={<LogIn className="rtl:-scale-x-100" />}
                    message={t('landing.signIn')}
                />
            </Stack>

            <Stack
                direction="Vertical"
                as="main"
                className={`${PAGE_WIDTH} gap-16 px-4 pt-14 pb-20 sm:px-6 sm:pt-20`}>
                <Stack direction="Vertical" as="section" className="items-start gap-5">
                    <Text
                        type="Title"
                        as="h1"
                        className="max-w-[24ch]"
                        message={t('landing.hero.title')}
                    />
                    <Text
                        type="ForegroundMuted"
                        className="max-w-[60ch]"
                        message={t('landing.hero.text')}
                    />

                    <Stack direction="Horizontal" className="flex-wrap gap-3">
                        <Button
                            size="lg"
                            link="/sign-in"
                            icon={<ArrowRight className="rtl:-scale-x-100" />}
                            iconPosition="end"
                            message={t('landing.hero.start')}
                        />
                        <Button
                            size="lg"
                            variant="outline"
                            onClick={() =>
                                document
                                    .getElementById('plans')
                                    ?.scrollIntoView({ behavior: 'smooth' })
                            }
                            message={t('landing.hero.plans')}
                        />
                    </Stack>
                </Stack>

                <Stack direction="Vertical" as="section" className="gap-6">
                    <SectionHeading
                        title={t('landing.features.title')}
                        text={t('landing.features.text')}
                    />

                    <Stack
                        direction="Vertical"
                        as="ul"
                        className="m-0 list-none gap-3 p-0 sm:grid sm:grid-cols-2 lg:grid-cols-3">
                        {LANDING_FEATURES.map(({ icon: Icon, title, text }) => (
                            <Stack direction="Vertical" as="li" key={title}>
                                <Card gap={3} className="h-full">
                                    <CardHeader>
                                        <Stack
                                            direction="Horizontal"
                                            className="items-center gap-2">
                                            <Icon size={18} className="shrink-0 text-primary" />
                                            <Text type="Heading" as="h3" message={t(title)} />
                                        </Stack>
                                    </CardHeader>
                                    <CardContent>
                                        <Text type="BodyMuted" message={t(text)} />
                                    </CardContent>
                                </Card>
                            </Stack>
                        ))}
                    </Stack>
                </Stack>

                <Stack direction="Vertical" as="section" className="gap-6">
                    <SectionHeading title={t('landing.uses.title')} text={t('landing.uses.text')} />

                    <Stack
                        direction="Vertical"
                        as="ul"
                        className="m-0 list-none gap-3 p-0 sm:grid sm:grid-cols-2">
                        {LANDING_USES.map(({ icon: Icon, title, text }) => (
                            <Stack
                                direction="Horizontal"
                                as="li"
                                key={title}
                                className="items-start gap-3 rounded-lg border bg-card p-4">
                                <Stack
                                    direction="Vertical"
                                    as="span"
                                    className="size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                                    <Icon size={16} className="text-primary" />
                                </Stack>
                                <Stack direction="Vertical" className="min-w-0 gap-1">
                                    <Text type="BodyStrong" as="h3" message={t(title)} />
                                    <Text type="BodyMuted" message={t(text)} />
                                </Stack>
                            </Stack>
                        ))}
                    </Stack>
                </Stack>

                <Stack direction="Vertical" as="section" className="gap-6">
                    <SectionHeading
                        id="plans"
                        title={t('landing.plans.title')}
                        text={t('landing.plans.text')}
                    />

                    {plansFailed && (
                        <Alert variant="destructive">
                            <AlertDescription>{t('landing.plans.loadFailed')}</AlertDescription>
                        </Alert>
                    )}

                    {plans === null && !plansFailed && (
                        <Stack
                            direction="Vertical"
                            className="gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
                            {[0, 1, 2, 3].map((n) => (
                                <Skeleton radius="xl" className="h-72" key={n} />
                            ))}
                        </Stack>
                    )}

                    {plans !== null && (
                        <Stack
                            direction="Vertical"
                            as="ul"
                            className="m-0 list-none gap-3 p-0 sm:grid sm:grid-cols-2 lg:grid-cols-4">
                            {plans.map((plan) => (
                                <Stack direction="Vertical" as="li" key={plan.key}>
                                    <Card
                                        className="h-full"
                                        signal={plan.key === 'pro' ? 'live' : undefined}>
                                        <CardHeader>
                                            <Stack direction="Vertical" className="gap-1">
                                                <Text
                                                    type="Heading"
                                                    as="h3"
                                                    message={t(PLAN_TEXT[plan.key].name)}
                                                />
                                                <PlanPrice price={plan.price} />
                                            </Stack>
                                        </CardHeader>

                                        <CardContent className="grow">
                                            <Stack direction="Vertical" className="gap-4">
                                                <Text
                                                    type="BodyMuted"
                                                    message={t(PLAN_TEXT[plan.key].blurb)}
                                                />
                                                <PlanLimits limits={plan.limits} />
                                            </Stack>
                                        </CardContent>

                                        <CardFooter>
                                            <Button
                                                className="w-full"
                                                variant={
                                                    plan.key === 'free' ? 'default' : 'outline'
                                                }
                                                link="/sign-in"
                                                message={
                                                    plan.key === 'free'
                                                        ? t('landing.plans.start')
                                                        : t('landing.plans.ask')
                                                }
                                            />
                                        </CardFooter>
                                    </Card>
                                </Stack>
                            ))}
                        </Stack>
                    )}
                </Stack>
            </Stack>
        </Stack>
    );
}
