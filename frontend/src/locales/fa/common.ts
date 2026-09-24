import type en from '../en/common';
import type { Messages } from '../types';

const messages: Messages<typeof en> = {
    'common.close': 'بستن',
    'common.previous': 'قبلی',
    'common.next': 'بعدی',
    'common.morePages': 'صفحه‌های بیشتر',
    'common.tokens': '~{count} توکن',
    'common.milliseconds': '{count} میلی‌ثانیه',
    'common.seconds': '{count} ثانیه',
    'common.uptime.days': '{days} روز و {hours} ساعت',
    'common.uptime.hours': '{hours} ساعت و {minutes} دقیقه',
    'common.uptime.minutes': '{minutes} دقیقه',
    'common.keepIt': 'نگه دارید',
    'common.pager.of': 'از',
};

export default messages;
