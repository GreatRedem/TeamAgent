import type en from '../en/plans';
import type { Messages } from '../types';

const messages: Messages<typeof en> = {
    'plans.free.name': 'رایگان',
    'plans.free.blurb': 'Nura را با یک پروژه و چند ایجنت امتحان کنید.',
    'plans.pro.name': 'حرفه‌ای',
    'plans.pro.blurb': 'برای تیمی که ربات‌ها و وظیفه‌هایش هر روز کار می‌کنند.',
    'plans.business.name': 'تجاری',
    'plans.business.blurb': 'برای چند پروژه، ربات‌های زیاد و زمان‌بندی سنگین.',
    'plans.custom.name': 'سفارشی',
    'plans.custom.blurb': 'سقف‌ها و شرایط مخصوص شما، که از راه یک تیکت پشتیبانی با ما توافق می‌کنید.',
    'plans.price.free': 'بدون هزینه',
    'plans.price.unit': 'تومان در ماه',
    'plans.price.contact': 'از ما بپرسید',
    'plans.limit.projects.one': '{count} پروژه',
    'plans.limit.projects.other': '{count} پروژه',
    'plans.limit.agents.one': '{count} ایجنت در هر پروژه',
    'plans.limit.agents.other': '{count} ایجنت در هر پروژه',
    'plans.limit.bots.one': '{count} ربات در هر پروژه',
    'plans.limit.bots.other': '{count} ربات در هر پروژه',
    'plans.limit.tasks.one': '{count} وظیفه در هر پروژه',
    'plans.limit.tasks.other': '{count} وظیفه در هر پروژه',
    'plans.limit.custom': 'پروژه، ایجنت، ربات و وظیفه به اندازهٔ توافق‌شده',
    'plans.card.title': 'طرح شما',
    'plans.card.projects': 'پروژه‌های استفاده‌شده',
    'plans.card.used': '{used} از {limit}',
    'plans.card.unlimited': '{used}، بدون سقف',
    'plans.card.until': 'پرداخت‌شده تا {date}.',
    'plans.card.free': 'هر حساب با طرح رایگان شروع می‌شود.',
    'plans.card.noEnd': 'بدون تاریخ پایان.',
    'plans.card.lapsed':
        'طرح {plan} شما در {date} تمام شد. تا تمدید آن، سقف‌های طرح رایگان اعمال می‌شود؛ چیزی حذف نشده است.',
    'plans.card.loadFailed': 'طرح شما بارگذاری نشد.',
    'plans.card.ask': 'درخواست طرح دیگر',
};

export default messages;
