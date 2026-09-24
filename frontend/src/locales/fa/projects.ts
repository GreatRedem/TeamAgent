import type en from '../en/projects';
import type { Messages } from '../types';

const messages: Messages<typeof en> = {
    'projects.transfer.models': 'مدل',
    'projects.transfer.people': 'نفر',
    'projects.transfer.agents': 'ایجنت',
    'projects.transfer.agentFiles': 'فایل ایجنت',
    'projects.transfer.bots': 'ربات',
    'projects.transfer.plugins': 'پلاگین',
    'projects.transfer.tasks': 'وظیفه',
    'projects.transfer.taskRuns': 'اجرای وظیفه',
    'projects.transfer.peopleFiles': 'فایل افراد',
    'projects.transfer.messages': 'پیام',
    'projects.transfer.exchanges': 'رفت‌وبرگشت با مدل',
    'projects.transfer.pluginCalls': 'درخواست پلاگین',
    'projects.transfer.teamFiles': 'فایل تیم',
    'projects.transfer.title': 'خروجی گرفتن و وارد کردن',
    'projects.transfer.description':
        'از کل این پروژه یک فایل zip خروجی بگیرید، یا فایلی را که از پروژهٔ دیگری خروجی گرفته شده اضافه کنید. کلیدهای API، توکن‌های ربات و رمزهای پلاگین هرگز در فایل قرار نمی‌گیرند.',
    'projects.transfer.export': 'خروجی گرفتن از پروژه',
    'projects.transfer.exporting': 'در حال خروجی گرفتن…',
    'projects.transfer.importLabel': 'وارد کردن فایل zip پروژه',
    'projects.transfer.importHint':
        'همهٔ محتوای آن در کنار آنچه این پروژه از قبل دارد اضافه می‌شود. چیزی در اینجا تغییر نمی‌کند یا حذف نمی‌شود.',
    'projects.transfer.import': 'وارد کردن',
    'projects.transfer.importing': 'در حال وارد کردن…',
    'projects.transfer.tooLarge': 'این فایل zip بزرگ‌تر از ۶۴ مگابایت است.',
    'projects.transfer.errors.exportFailed': 'از پروژه خروجی گرفته نشد.',
    'projects.transfer.errors.importFailed': 'پروژه وارد نشد.',
    'projects.transfer.report.added': 'از {from} اضافه شد: {items}.',
    'projects.transfer.report.addedFromZip': 'از فایل zip اضافه شد: {items}.',
    'projects.transfer.report.nothing': 'از {from} چیز تازه‌ای اضافه نشد.',
    'projects.transfer.report.nothingFromZip': 'از فایل zip چیز تازه‌ای اضافه نشد.',
    'projects.transfer.report.skipped': 'اضافه نشد: {items}.',
    'projects.errors.loadFailed': 'پروژه‌های شما بارگذاری نشدند.',
    'projects.errors.createFailed': 'پروژه ساخته نشد.',
    'projects.errors.projectLoadFailed': 'این پروژه بارگذاری نشد.',
    'projects.errors.saveFailed': 'تغییرات ذخیره نشدند.',
    'projects.errors.updateFailed': 'پروژه به‌روز نشد.',
    'projects.errors.deleteFailed': 'پروژه حذف نشد.',
    'projects.errors.noSection': 'این پروژه چنین بخشی ندارد.',
    'projects.list.title': 'پروژه‌ها',
    'projects.list.description':
        'هر پروژه ربات‌هایی را که مردم به آن‌ها پیام می‌دهند، ایجنت‌هایی که پاسخ می‌دهند و مدل‌هایی که پشتشان هستند در خود دارد.',
    'projects.list.archivedTitle': 'پروژه‌های بایگانی‌شده',
    'projects.list.archivedDescription':
        'پروژه‌هایی که کنار گذاشته‌اید. یکی را باز کنید تا آن را بازگردانی یا برای همیشه حذف کنید.',
    'projects.list.showActive': 'پروژه‌های فعال',
    'projects.list.showArchived': 'بایگانی‌شده‌ها',
    'projects.list.new': 'پروژهٔ تازه',
    'projects.list.emptyTitle': 'هنوز پروژه‌ای ندارید',
    'projects.list.emptyDescription':
        'با یک پروژه شروع کنید. در چند دقیقه می‌توانید یک مدل، یک ایجنت و یک ربات به آن اضافه کنید.',
    'projects.list.archivedEmptyTitle': 'چیزی بایگانی نشده است',
    'projects.list.archivedEmptyDescription':
        'پروژه را از تنظیمات آن بایگانی کنید تا بی‌آنکه از دست برود کنار گذاشته شود.',
    'projects.list.noDescription': 'هنوز توضیحی ندارد.',
    'projects.list.open': 'باز کردن',
    'projects.list.restoreOrDelete': 'بازگردانی یا حذف',
    'projects.list.pagerNoun': 'پروژه',
    'projects.create.title': 'پروژهٔ تازه',
    'projects.create.description': 'ربات‌ها، ایجنت‌ها و مدل‌هایی را که به هم مربوط‌اند یک‌جا گروه کنید.',
    'projects.create.cancel': 'انصراف',
    'projects.create.submit': 'ساخت پروژه',
    'projects.create.busy': 'در حال ساخت…',
    'projects.field.name': 'نام',
    'projects.field.namePlaceholder': 'شیفت شب',
    'projects.field.purpose': 'برای چه کاری است',
    'projects.field.purposeHint': 'اختیاری. روی کارت پروژه نمایش داده می‌شود.',
    'projects.field.optional': 'اختیاری.',
    'projects.field.purposePlaceholder': 'پشتیبانی بیرون از ساعت‌های کاری',
    'projects.settings.title': 'جزئیات پروژه',
    'projects.settings.dates': 'ساخته‌شده در {created}، آخرین تغییر در {changed}.',
    'projects.settings.save': 'ذخیرهٔ تغییرات',
    'projects.settings.saving': 'در حال ذخیره…',
    'projects.settings.saved': 'ذخیره شد.',
    'projects.archive.title': 'بایگانی',
    'projects.archive.archivedTitle': 'این پروژه بایگانی شده است',
    'projects.archive.description':
        'پروژهٔ بایگانی‌شده از فهرست پروژه‌ها بیرون می‌رود. ربات‌هایش تنظیماتشان را نگه می‌دارند و می‌توانید از همین‌جا آن را بازگردانی یا حذف کنید.',
    'projects.archive.archivedDescription':
        'در {date} بایگانی شد. برای برگرداندن آن به فهرست پروژه‌ها بازگردانی‌اش کنید، یا برای همیشه حذفش کنید.',
    'projects.archive.archive': 'بایگانی پروژه',
    'projects.archive.archiving': 'در حال بایگانی…',
    'projects.archive.restore': 'بازگردانی از بایگانی',
    'projects.archive.restoring': 'در حال بازگردانی…',
    'projects.delete.label': 'حذف پروژه',
    'projects.delete.title': 'این پروژه حذف شود؟',
    'projects.delete.description':
        'ربات‌ها، ایجنت‌ها، مدل‌ها، گفتگوها و سوابق آن هم همراهش حذف می‌شوند. این کار برگشت‌پذیر نیست.',
    'projects.delete.confirm': 'حذف برای همیشه',
    'projects.importNote.botsWithoutToken.one':
        '{count} ربات بدون توکن وارد شد. توکنش را در بخش ربات‌ها وارد کنید تا دوباره روشن شود.',
    'projects.importNote.botsWithoutToken.other':
        '{count} ربات بدون توکن وارد شد. توکن هرکدام را در بخش ربات‌ها وارد کنید تا دوباره روشن شوند.',
    'projects.importNote.modelsWithoutKey':
        'مدل‌های واردشده کلید API ندارند. برای هر مدلی که لازم دارد یک کلید اضافه کنید.',
    'projects.importNote.pluginsOff':
        'پلاگین‌های واردشده خاموش‌اند تا رمزهایشان را وارد و روشنشان کنید.',
    'projects.importNote.tasksPaused.one':
        '{count} وظیفهٔ زمان‌بندی‌شده به‌صورت لغوشده وارد شد تا چیزی دو بار اجرا نشود. اگر آن را می‌خواهید، دوباره زمان‌بندی‌اش کنید.',
    'projects.importNote.tasksPaused.other':
        '{count} وظیفهٔ زمان‌بندی‌شده به‌صورت لغوشده وارد شد تا چیزی دو بار اجرا نشود. هرکدام را که می‌خواهید دوباره زمان‌بندی کنید.',
    'projects.importNote.modelsReused':
        'مدل‌هایی که این پروژه از قبل داشت، به‌جای افزودن دوباره، دوباره به کار رفتند.',
    'projects.importNote.peopleKept':
        'افرادی که این پروژه از قبل می‌شناخت همان‌طور ماندند و تاریخچهٔ واردشده به آن‌ها اضافه شد.',
    'projects.importNote.keptFiles': 'فایل‌های خود این پروژه نگه داشته شد: {files}.',
    'projects.importNote.auditStays': 'گزارش فعالیت‌ها در همان پروژه‌ای می‌ماند که در آن ثبت شده است.',
};

export default messages;
