import type en from '../en/layout';
import type { Messages } from '../types';

const messages: Messages<typeof en> = {
    'layout.signOut': 'خروج',
    'layout.nav.overview': 'نمای کلی',
    'layout.nav.agents': 'ایجنت‌ها',
    'layout.nav.bots': 'ربات‌ها',
    'layout.nav.models': 'مدل‌ها',
    'layout.nav.tasks': 'وظیفه‌ها',
    'layout.nav.team': 'تیم',
    'layout.nav.tools': 'MCP',
    'layout.nav.plugins': 'پلاگین‌ها',
    'layout.nav.settings': 'تنظیمات',
    'layout.page.overview.title': 'نمای کلی',
    'layout.page.overview.description': 'این پروژه همین حالا چطور کار می‌کند.',
    'layout.page.agents.title': 'ایجنت‌ها',
    'layout.page.agents.description': 'نقش‌هایی که پاسخ می‌دهند و مدل‌هایی که پشتشان هستند.',
    'layout.page.bots.title': 'ربات‌ها',
    'layout.page.bots.description': 'ربات‌هایی که مردم به آن‌ها پیام می‌دهند و کسانی که پیام داده‌اند.',
    'layout.page.models.title': 'مدل‌ها',
    'layout.page.models.description': 'اندپوینت‌هایی که این پروژه می‌تواند فراخوانی کند.',
    'layout.page.tasks.title': 'وظیفه‌ها',
    'layout.page.tasks.description':
        'کارهایی که ایجنت‌ها در زمانی مشخص انجام می‌دهند، و نتیجهٔ هر اجرا.',
    'layout.page.team.title': 'تیم',
    'layout.page.team.description':
        'افراد این تیم، که در team.json نگه داشته می‌شوند تا ایجنت‌ها از روی آن پاسخ دهند.',
    'layout.page.tools.title': 'ابزارهای MCP',
    'layout.page.tools.description':
        'ابزارهایی که ایجنت‌ها می‌توانند فراخوانی کنند، مثل مدیریت team.json، و اینکه کدام ایجنت‌ها اجازهٔ فراخوانی‌شان را دارند.',
    'layout.page.plugins.title': 'پلاگین‌ها',
    'layout.page.plugins.description':
        'برنامه‌هایی که ایجنت‌ها در آن‌ها پست می‌گذارند، پاسخ می‌دهند و از آن‌ها می‌خوانند؛ کاربرد هرکدام و همهٔ درخواست‌هایشان.',
    'layout.page.settings.title': 'تنظیمات',
    'layout.page.settings.description':
        'نام این پروژه، و انتقال آن به داخل یا بیرون به‌صورت فایل zip.',
    'layout.projects.title': 'پروژه‌ها',
    'layout.projects.loading': 'در حال بارگذاری…',
    'layout.projects.empty': 'هنوز پروژه‌ای وجود ندارد.',
    'layout.projects.all': 'همهٔ پروژه‌ها',
    'layout.projects.fallback': 'پروژهٔ {id}',
    'layout.notFound.title': 'این صفحه وجود ندارد',
    'layout.notFound.description': 'نشانی را بررسی کنید، یا به جایی که شروع کردید برگردید.',
    'layout.notFound.back': 'بازگشت به صفحهٔ ورود',
};

export default messages;
