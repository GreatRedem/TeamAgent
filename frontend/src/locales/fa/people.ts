import type en from '../en/people';
import type { Messages } from '../types';

const messages: Messages<typeof en> = {
    'people.errors.loadFailed': 'افراد بارگذاری نشدند.',
    'people.errors.threadFailed': 'گفتگو بارگذاری نشد.',
    'people.errors.profileFailed': 'این شخص بارگذاری نشد.',
    'people.errors.notesFailed': 'یادداشت‌ها بارگذاری نشدند.',
    'people.errors.permissionFailed': 'دسترسی تغییر نکرد.',
    'people.list.title': 'افراد',
    'people.list.description':
        'همهٔ کسانی که به یکی از ربات‌های این پروژه پیام داده‌اند، به‌ترتیب از جدیدترین.',
    'people.list.emptyTitle': 'هنوز کسی پیام نداده است',
    'people.list.emptyDescription':
        'هر کس اولین بار که به یکی از ربات‌های شما پیام دهد، اینجا نشان داده می‌شود.',
    'people.list.username': '‎@{username}،',
    'people.list.messageCount.one': '{count} پیام',
    'people.list.messageCount.other': '{count} پیام',
    'people.list.openProfile': 'صفحهٔ کامل شخص',
    'people.list.noMessages': 'هنوز پیامی برای این شخص ذخیره نشده است.',
    'people.pager.people': 'نفر',
    'people.pager.messages': 'پیام',
    'people.pager.notes': 'یادداشت',
    'people.profile.title': 'شخص',
    'people.profile.loading': 'در حال بارگذاری این شخص.',
    'people.profile.summary': '{messages} در {bots}.',
    'people.profile.messages.one': '{count} پیام',
    'people.profile.messages.other': '{count} پیام',
    'people.profile.bots.one': '{count} ربات',
    'people.profile.bots.other': '{count} ربات',
    'people.profile.back': 'همهٔ افراد',
    'people.profile.messagesTitle': 'پیام‌های اخیر',
    'people.profile.messagesDescription': 'جدیدترین پیام‌هایی که Nura برای این شخص ذخیره کرده است.',
    'people.profile.noMessages': 'هنوز پیامی ذخیره نشده است.',
    'people.profile.notesTitle': 'یادداشت‌های ایجنت‌ها',
    'people.profile.notesDescription': 'هر ایجنت فایل‌های خودش را دربارهٔ این شخص نگه می‌دارد.',
    'people.profile.noNotes': 'هنوز هیچ ایجنتی چیزی دربارهٔ این شخص ننوشته است.',
    'people.profile.legacyNotes': 'پیش از یادداشت‌های جداگانهٔ ایجنت‌ها',
    'people.profile.removedAgent': 'ایجنت حذف‌شده',
    'people.profile.identityTitle': 'هویت',
    'people.profile.identityDescription': 'آنچه تلگرام دربارهٔ این شخص گزارش می‌دهد.',
    'people.profile.telegramId': 'شناسهٔ تلگرام',
    'people.profile.username': 'نام کاربری',
    'people.profile.language': 'زبان',
    'people.profile.firstSeen': 'اولین مشاهده',
    'people.profile.lastSeen': 'آخرین مشاهده',
    'people.profile.permissionsTitle': 'دسترسی‌ها',
    'people.profile.permissionsDescription':
        'کارهایی که این شخص می‌تواند از ایجنت بخواهد. هر چیزی که اجازه‌اش داده نشده باشد رد می‌شود.',
    'people.picker.placeholder': 'جستجو با نام یا نام کاربری',
};

export default messages;
