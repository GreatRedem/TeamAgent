import type en from '../en/team';
import type { Messages } from '../types';

const messages: Messages<typeof en> = {
    'team.access.read': 'می‌خواند',
    'team.access.create': 'عضو اضافه می‌کند',
    'team.access.update': 'اعضا را به‌روز می‌کند',
    'team.access.delete': 'عضو حذف می‌کند',
    'team.errors.loadFailed': 'تیم بارگذاری نشد.',
    'team.errors.removeFailed': 'این عضو حذف نشد.',
    'team.errors.permissionFailed': 'این قابلیت تغییر نکرد.',
    'team.errors.saveFailed': 'این عضو ذخیره نشد.',
    'team.addMember': 'افزودن عضو',
    'team.loading': 'در حال بارگذاری تیم.',
    'team.summary.one': '{count} نفر در team.json.',
    'team.summary.other': '{count} نفر در team.json.',
    'team.empty.title': 'هنوز کسی در تیم نیست',
    'team.empty.description':
        'افرادی را که ایجنت‌ها باید بشناسند اضافه کنید: نقش‌هایشان، کاری که انجام می‌دهند و جایی که پیدایشان می‌شود کرد. آن‌ها را از میان افرادی که به ربات‌هایتان پیام داده‌اند انتخاب کنید، یا خودتان وارد کنید.',
    'team.member.profile': 'شخص',
    'team.member.modify': 'ویرایش',
    'team.remove.label': 'حذف',
    'team.remove.title': '{name} حذف شود؟',
    'team.remove.description': 'از team.json بیرون می‌رود و ایجنت‌ها دیگر او را نمی‌شناسند.',
    'team.remove.confirm': 'حذف عضو',
    'team.agents.title': 'ایجنت‌هایی که از روی آن پاسخ می‌دهند',
    'team.agents.description':
        'ایجنتی که اجازهٔ خواندن team.json را دارد، آن را در دستورالعمل‌هایش دارد و از روی آن به پرسش‌ها دربارهٔ تیم پاسخ می‌دهد. افزودن، به‌روزرسانی و حذف اعضا ابزارهای جداگانه‌اند و هرکدام جدا اجازه داده می‌شود.',
    'team.agents.empty': 'این پروژه هنوز ایجنتی ندارد.',
    'team.file.description': 'فایل، همان‌طور که به ایجنت‌ها داده می‌شود.',
    'team.dialog.addTitle': 'افزودن عضو تیم',
    'team.dialog.editTitle': 'ویرایش {name}',
    'team.dialog.description':
        'آنچه اینجا می‌نویسید در team.json ذخیره می‌شود، و ایجنت‌هایی که اجازهٔ خواندنش را دارند از روی آن پاسخ می‌دهند.',
    'team.dialog.theirProfile': 'حساب تلگرام او',
    'team.dialog.cancel': 'انصراف',
    'team.dialog.saving': 'در حال ذخیره…',
    'team.dialog.add': 'افزودن عضو',
    'team.dialog.save': 'ذخیرهٔ تغییرات',
    'team.field.profile.label': 'از میان افراد',
    'team.field.profile.hint':
        'اختیاری. کسی را که به یک ربات پیام داده انتخاب کنید تا به او پیوند داده شود.',
    'team.field.profile.hintLinked': 'پیوند داده شده به {name}.',
    'team.field.profile.unlink': 'حذف پیوند',
    'team.field.name.label': 'نام',
    'team.field.name.hint': 'ایجنت‌ها با این نام از او یاد می‌کنند.',
    'team.field.roles.label': 'نقش‌ها',
    'team.field.roles.hint':
        'همهٔ نقش‌های او در تیم، مثل «مدیر» و «مهندس ارشد نرم‌افزار». بعد از هرکدام Enter را بزنید، حداکثر {max} نقش.',
    'team.field.roles.placeholder': 'افزودن نقش',
    'team.field.description.label': 'توضیحات',
    'team.field.description.hint': 'چه کاری انجام می‌دهد، و چه چیزهایی را می‌شود از او پرسید.',
    'team.social.title': 'شبکه‌های اجتماعی',
    'team.social.empty': 'هنوز چیزی ثبت نشده است.',
    'team.social.network': 'شبکه',
    'team.social.handle': '@نام‌کاربری یا پیوند',
    'team.social.add': 'افزودن شبکه',
};

export default messages;
