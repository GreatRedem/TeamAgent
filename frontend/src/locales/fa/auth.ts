import type en from '../en/auth';
import type { Messages } from '../types';

const messages: Messages<typeof en> = {
    'auth.wallet.nura': 'ساخته‌شده برای Nura؛ بدون ترک برنامه امضا می‌کند',
    'auth.wallet.metamask': 'افزونهٔ مرورگری که شاید از قبل داشته باشید',
    'auth.intro': 'با امضای کیف پول وارد شوید. رمز عبوری در کار نیست که گم شود.',
    'auth.signIn': 'ورود با کیف پول',
    'auth.dialog.title': 'یک کیف پول انتخاب کنید',
    'auth.dialog.description':
        'ورود به Nura با یک امضا انجام می‌شود؛ هیچ دارایی‌ای جابه‌جا نمی‌شود و هزینهٔ گس هم ندارد.',
    'auth.dialog.looking': 'در حال جست‌وجو',
    'auth.dialog.notInstalled': 'روی این مرورگر نصب نیست',
    'auth.dialog.noneFound': 'هیچ کیف پولی پیدا نشد. یکی نصب کنید و این پنجره را دوباره باز کنید.',
    'auth.step.opening': 'در حال باز کردن {name}',
    'auth.step.challenge': 'در حال دریافت پیام برای امضا',
    'auth.step.signature': 'در انتظار امضای شما',
    'auth.step.checking': 'در حال بررسی امضا',
    'auth.errors.noAccount':
        '{name} حسابی در اختیار نگذاشت. قفل آن را باز کنید و دوباره تلاش کنید.',
    'auth.errors.unreadableSignature': '{name} امضایی برگرداند که Nura نتوانست بخواند.',
    'auth.errors.signInFailed': 'ورود کامل نشد.',
};

export default messages;
