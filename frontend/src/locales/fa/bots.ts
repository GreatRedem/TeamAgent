import type en from '../en/bots';
import type { Messages } from '../types';

const messages: Messages<typeof en> = {
    'bots.loading': 'در حال بارگذاری ربات‌ها.',
    'bots.connectedCount.one': '{count} ربات به تلگرام متصل است.',
    'bots.connectedCount.other': '{count} ربات به تلگرام متصل است.',
    'bots.pager.noun': 'ربات',
    'bots.probe.asking': 'در حال پرسیدن از تلگرام…',
    'bots.probe.refused': 'تلگرام توکن را نپذیرفت.',
    'bots.probe.connected': 'متصل شد.',
    'bots.probe.connectedAs': 'به‌عنوان ‎@{username} متصل شد.',
    'bots.probe.privacy':
        '{connected} حالت حریم خصوصی روشن است، پس تلگرام در گروه‌ها فقط پاسخ‌ها به پیام‌های خود ربات و دستورهای /command را برایش می‌فرستد، نه منشن‌ها را. ربات را مدیر گروه کنید، یا /setprivacy را برای ‎@BotFather بفرستید، Disable را انتخاب کنید و سپس ربات را دوباره به گروه اضافه کنید.',
    'bots.probe.noAnswer': 'پاسخی از تلگرام نیامد.',
    'bots.errors.loadFailed': 'ربات‌ها بارگذاری نشدند.',
    'bots.errors.addFailed': 'ربات اضافه نشد.',
    'bots.errors.webhookRejected': 'تلگرام این نشانی را نپذیرفت.',
    'bots.errors.addressFailed': 'نشانی ذخیره نشد.',
    'bots.errors.updateFailed': 'ربات به‌روزرسانی نشد.',
    'bots.errors.removeFailed': 'ربات حذف نشد.',
    'bots.create.action': 'اتصال ربات',
    'bots.create.title': 'اتصال ربات',
    'bots.create.description':
        'ابتدا ربات را با BotFather در تلگرام بسازید، سپس توکنش را اینجا جای‌گذاری کنید.',
    'bots.create.name': 'نام',
    'bots.create.nameHint': 'فقط شما این را می‌بینید. این نام، ربات را در Nura مشخص می‌کند.',
    'bots.create.namePlaceholder': 'ربات پشتیبانی',
    'bots.create.token': 'توکن BotFather',
    'bots.create.tokenHint':
        'به‌صورت فقط‌نوشتنی ذخیره می‌شود. Nura فقط چهار نویسهٔ آخر آن را نشان می‌دهد و نه بیشتر.',
    'bots.create.publicUrl': 'نشانی عمومی',
    'bots.create.publicUrlHint':
        'اگر خالی بماند، Nura به‌جای دریافت وب‌هوک، با پولینگ از تلگرام پیام می‌گیرد.',
    'bots.create.cancel': 'انصراف',
    'bots.create.submit': 'اتصال ربات',
    'bots.create.submitting': 'در حال اتصال…',
    'bots.empty.title': 'هیچ رباتی متصل نیست',
    'bots.empty.description':
        'مردم از راه ربات با ایجنت‌های شما در ارتباط‌اند. یکی را با BotFather بسازید، سپس توکنش را اینجا جای‌گذاری کنید.',
    'bots.card.status': 'ربات {name}',
    'bots.card.webhook': 'وب‌هوک',
    'bots.card.polling': 'پولینگ',
    'bots.card.token': 'توکن',
    'bots.card.tokenUnset': 'هنوز تنظیم نشده',
    'bots.card.tokenMissing':
        'این ربات بدون توکن از یک فایل واردشده آمده است. برای روشن کردنش، توکن را از BotFather اینجا جای‌گذاری کنید.',
    'bots.card.saveToken': 'ذخیرهٔ توکن',
    'bots.card.agent': 'پاسخ‌دهنده',
    'bots.card.agentPlaceholder': 'هنوز هیچ‌کس',
    'bots.card.agentNone': 'هیچ‌کس',
    'bots.card.groups': 'پاسخ در گروه‌ها، وقتی منشن شود یا به پیامش پاسخ دهند',
    'bots.card.peopleAll':
        'به همهٔ کسانی که اجازهٔ گفتگو دارند پاسخ می‌دهد. برای پاسخ فقط به افرادی خاص، آن‌ها را انتخاب کنید.',
    'bots.card.peopleSome': 'فقط به این افراد پاسخ می‌دهد',
    'bots.card.publicUrl': 'نشانی عمومی',
    'bots.card.save': 'ذخیره',
    'bots.card.saving': 'در حال ذخیره…',
    'bots.card.test': 'آزمایش توکن',
    'bots.card.testing': 'در حال آزمایش…',
    'bots.remove.label': 'حذف',
    'bots.remove.title': '{name} حذف شود؟',
    'bots.remove.description':
        'Nura توکن را فراموش می‌کند و دیگر برای این ربات پاسخ نمی‌دهد. خود ربات در تلگرام باقی می‌ماند.',
    'bots.remove.confirm': 'حذف ربات',
};

export default messages;
