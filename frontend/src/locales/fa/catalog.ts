const messages: Record<string, string> = {
    'catalog.capability.prefs.read.label': 'خواندن فایل‌ها',
    'catalog.capability.prefs.read.description':
        'به این ایجنت اجازه می‌دهد فایل‌های markdown را که برای افرادِ طرف گفتگویش نگه می‌دارد بخواند.',
    'catalog.capability.prefs.write.label': 'نوشتن فایل‌ها',
    'catalog.capability.prefs.write.description':
        'به این ایجنت اجازه می‌دهد همان فایل‌ها را بسازد و تغییر دهد. داشتن این اجازه به معنای اجازهٔ خواندن نیست.',
    'catalog.capability.conversation.read.label': 'جستجو در پیام‌های گذشته',
    'catalog.capability.conversation.read.description':
        'به این ایجنت اجازه می‌دهد پیام‌هایی را که هر شخص قبلاً برایش فرستاده، فراتر از چند پیام اخیری که خودش می‌بیند، مرور کند.',
    'catalog.capability.team.read.label': 'دیدن فهرست افراد تیم',
    'catalog.capability.team.read.description':
        'به این ایجنت اجازه می‌دهد فهرست افرادی را که تیم می‌شناسد ببیند و آنچه دربارهٔ آن‌ها ثبت شده بخواند، نه فقط دربارهٔ کسی که همین حالا با او گفتگو می‌کند.',
    'catalog.capability.team.write.label': 'به خاطر سپردن نکته‌هایی دربارهٔ تیم',
    'catalog.capability.team.write.description':
        'به این ایجنت اجازه می‌دهد دربارهٔ هر عضو تیم یادداشت اضافه کند. فقط می‌تواند چیزی اضافه کند، پس آنچه قبلاً ثبت شده از بین نمی‌رود.',
    'catalog.capability.panel.tasks.label': 'مدیریت وظیفه‌ها',
    'catalog.capability.panel.tasks.description':
        'به این ایجنت اجازه می‌دهد وظیفه‌های این پروژه، از جمله زنجیره‌ها، را فهرست کند، بسازد، تغییر دهد و حذف کند. فقط وقتی کار می‌کند که کسی که درخواست می‌دهد در team.json دست‌کم یک نقش داشته باشد، و هر تغییر همراه با نام درخواست‌کننده در فعالیت‌ها ثبت می‌شود.',
    'catalog.capability.panel.plugins.label': 'مدیریت پلاگین‌ها',
    'catalog.capability.panel.plugins.description':
        'به این ایجنت اجازه می‌دهد پلاگین‌های این پروژه را فهرست کند، اضافه کند، تغییر دهد و حذف کند. فقط وقتی کار می‌کند که کسی که درخواست می‌دهد در team.json دست‌کم یک نقش داشته باشد، و هر تغییر همراه با نام درخواست‌کننده در فعالیت‌ها ثبت می‌شود.',
    'catalog.capability.panel.agents.label': 'مدیریت ایجنت‌ها',
    'catalog.capability.panel.agents.description':
        'به این ایجنت اجازه می‌دهد ایجنت‌های این پروژه، مدلشان، فایل‌های دستورالعمل و اجازه‌هایشان را فهرست کند، بسازد، تغییر دهد و حذف کند. فقط وقتی کار می‌کند که کسی که درخواست می‌دهد در team.json دست‌کم یک نقش داشته باشد، و هر تغییر همراه با نام درخواست‌کننده در فعالیت‌ها ثبت می‌شود. هرگز اجازه‌های خودش را تغییر نمی‌دهد و فقط اجازه‌هایی را می‌دهد که خودش دارد.',
    'catalog.capability.panel.models.label': 'مدیریت مدل‌ها',
    'catalog.capability.panel.models.description':
        'به این ایجنت اجازه می‌دهد مدل‌های این پروژه را فهرست کند، اضافه کند، تغییر دهد، آزمایش کند و حذف کند. فقط وقتی کار می‌کند که کسی که درخواست می‌دهد در team.json دست‌کم یک نقش داشته باشد، و هر تغییر همراه با نام درخواست‌کننده در فعالیت‌ها ثبت می‌شود.',
    'catalog.capability.panel.bots.label': 'مدیریت ربات‌ها',
    'catalog.capability.panel.bots.description':
        'به این ایجنت اجازه می‌دهد ربات‌های تلگرام این پروژه را فهرست کند، اضافه کند، تغییر دهد، آزمایش کند و حذف کند و انتخاب کند کدام ایجنت به هر کدام پاسخ دهد. فقط وقتی کار می‌کند که کسی که درخواست می‌دهد در team.json دست‌کم یک نقش داشته باشد، و هر تغییر همراه با نام درخواست‌کننده در فعالیت‌ها ثبت می‌شود.',
    'catalog.capability.panel.people.label': 'مدیریت افراد و خواندن فعالیت‌ها',
    'catalog.capability.panel.people.description':
        'به این ایجنت اجازه می‌دهد افرادی را که به ربات‌هایتان پیام داده‌اند فهرست کند، کارهایی را که هر کدام اجازه دارند تغییر دهد، و فعالیت‌ها و آمار نمای کلی را بخواند. فقط وقتی کار می‌کند که کسی که درخواست می‌دهد در team.json دست‌کم یک نقش داشته باشد، و هر تغییر همراه با نام درخواست‌کننده در فعالیت‌ها ثبت می‌شود.',
    'catalog.capability.team.chat.label': 'روشن و خاموش کردن گفتگو با مدل برای افراد',
    'catalog.capability.team.chat.description':
        'به این ایجنت اجازه می‌دهد «گفتگو با مدل» را برای کسی که به ربات‌هایتان پیام داده روشن یا خاموش کند، اما فقط وقتی کسی که درخواست می‌دهد در team.json با دست‌کم یک نقش باشد. چیز دیگری دربارهٔ آن شخص تغییر نمی‌کند. team.read را هم بدهید تا بتواند افراد را پیدا کند.',
    'catalog.capability.roster.read.label': 'خواندن فایل تیم',
    'catalog.capability.roster.read.description':
        'به این ایجنت اجازه می‌دهد team.json را بخواند: چه کسانی در تیم هستند، چه کاری می‌کنند، نقش‌هایشان و شناسه‌های عمومی‌شان.',
    'catalog.capability.roster.create.label': 'افزودن عضو تیم',
    'catalog.capability.roster.create.description':
        'به این ایجنت اجازه می‌دهد شخص تازه‌ای به team.json اضافه کند. نمی‌تواند کسی را که از قبل هست تغییر دهد یا حذف کند.',
    'catalog.capability.roster.update.label': 'به‌روزرسانی اعضای تیم',
    'catalog.capability.roster.update.description':
        'به این ایجنت اجازه می‌دهد آنچه team.json دربارهٔ یکی از اعضا می‌گوید تغییر دهد: نقش‌ها، توضیح، شناسه‌ها یا نام. فقط فیلدهایی که می‌فرستد تغییر می‌کنند.',
    'catalog.capability.roster.delete.label': 'حذف عضو تیم',
    'catalog.capability.roster.delete.description':
        'به این ایجنت اجازه می‌دهد شخصی را از team.json بیرون ببرد. این تنها کاری در team.json است که اطلاعات را از بین می‌برد، پس با احتیاط بدهید.',
    'catalog.capability.agents.call.label': 'درخواست از ایجنت‌های دیگر',
    'catalog.capability.agents.call.description':
        'به این ایجنت اجازه می‌دهد درخواستی را به ایجنت دیگری در این پروژه بسپارد تا با قابلیت‌های خودش انجامش دهد. فقط وقتی در اختیارش است که به کسی پاسخ می‌دهد که اجازهٔ درخواست از ایجنت‌های دیگر را دارد.',
    'catalog.capability.web.fetch.label': 'استفاده از وب',
    'catalog.capability.web.fetch.description':
        'به این ایجنت اجازه می‌دهد در وب جستجو کند، صفحه‌های عمومی را بخواند و وضع هوا را ببیند. نشانی‌های خصوصی، loopback و metadata ابری همیشه رد می‌شوند، هر کس که درخواست بدهد.',
    'catalog.capability.basics.label': 'دانستن ساعت',
    'catalog.capability.basics.description':
        'به این ایجنت اجازه می‌دهد تاریخ و ساعت فعلی را بداند. بی‌خطر است.',

    'catalog.tool.preferences_list':
        'فهرست فایل‌های markdown که برای شخص طرف گفتگو نگه می‌دارید. ایجنت‌های دیگر فایل‌های خودشان را دارند.',
    'catalog.tool.preferences_read':
        'یکی از فایل‌های markdown را که برای این شخص نگه می‌دارید بخوانید، مثلاً preferences.md.',
    'catalog.tool.preferences_write':
        'کل محتوای یکی از فایل‌های markdown این شخص را جایگزین می‌کند و اگر لازم باشد آن را می‌سازد. مگر اینکه بخواهید محتوای فعلی را کنار بگذارید، اول آن را بخوانید.',
    'catalog.tool.preferences_append':
        'یک خط به انتهای یکی از فایل‌های markdown این شخص اضافه می‌کند، بی‌آنکه آن را از نو بنویسد.',
    'catalog.tool.profile_get':
        'اطلاعات ذخیره‌شده دربارهٔ شخص طرف گفتگو را می‌خواند: نام، نام کاربری، زبان و اینکه چقدر نوشته است.',
    'catalog.tool.conversation_search':
        'در همهٔ آنچه این شخص قبلاً برایتان نوشته جستجو می‌کند، فراتر از پیام‌های اخیری که از قبل می‌بینید.',
    'catalog.tool.team_members':
        'فهرست افرادی که این تیم می‌شناسد: هر کسی که به یکی از ربات‌هایش پیام داده. وقتی باید بدانید کسی کیست، از اینجا شروع کنید.',
    'catalog.tool.team_member_read':
        'آنچه را دربارهٔ یکی از اعضای تیم ثبت کرده‌اید می‌خواند. از member_id فهرست team_members استفاده کنید.',
    'catalog.tool.team_member_note':
        'با افزودن یک خط به یادداشت‌هایتان، چیزی را دربارهٔ یکی از اعضای تیم به خاطر می‌سپارد. فقط اضافه می‌کند، پس آنچه قبلاً ثبت شده از بین نمی‌رود.',
    'catalog.tool.task_list':
        'وظیفه‌های این پروژه را فهرست می‌کند: شناسه، عنوان، ایجنتی که اجرایش می‌کند، زمان شروع، دفعات تکرار، وضعیت و نتیجهٔ آخرین اجرا.',
    'catalog.tool.task_create':
        'یک وظیفه می‌سازد: ایجنت دستورها را در start_at و در هر تکرار اجرا می‌کند، یا درست پس از تمام شدن یک وظیفهٔ دیگر، که آن‌ها را به هم زنجیر می‌کند و نتیجهٔ آن وظیفه را به این می‌دهد. تکرار یکی از none، every30m، hourly، every2h، every5h، every6h، daily یا weekly است. نتیجه با پیام خصوصی برای شخص انتخاب‌شده فرستاده می‌شود.',
    'catalog.tool.task_update':
        'یک وظیفه را تغییر می‌دهد. فقط فیلدهایی که داده شوند تغییر می‌کنند. وظیفه‌ای را که در حال اجراست نمی‌تواند تغییر دهد.',
    'catalog.tool.task_delete':
        'یک وظیفه و تاریخچهٔ اجراهایش را حذف می‌کند. برگشت‌پذیر نیست، پس اول از شخص تأیید بگیرید.',
    'catalog.tool.plugin_kinds':
        'انواع پلاگینی که می‌شود اضافه کرد و فیلدهایی که هر کدام لازم دارد. پیش از plugin_create آن را بخوانید.',
    'catalog.tool.plugin_list':
        'پلاگین‌های این پروژه را فهرست می‌کند: شناسه، نوع، نام، روشن یا خاموش بودن، حسابی که با آن کار می‌کند، ایجنت‌هایی که می‌توانند از آن استفاده کنند، ایجنتی که پاسخ می‌دهد، در حال گوش دادن بودن، و اینکه کدام فیلدهای رمز تنظیم شده‌اند. مقدار رمزها هرگز نشان داده نمی‌شود.',
    'catalog.tool.plugin_create':
        'یک پلاگین اضافه می‌کند. نوع و فیلدهایش را از plugin_kinds بگیرید. پس از ذخیره یک بار آزمایش می‌شود و نتیجه می‌گوید موفق بود یا نه.',
    'catalog.tool.plugin_update':
        'یک پلاگین را تغییر می‌دهد. فقط چیزهایی که داده شوند تغییر می‌کنند: فیلدهایی که داده نشوند، از جمله رمزها، مقدارشان را نگه می‌دارند.',
    'catalog.tool.plugin_delete':
        'یک پلاگین و تاریخچهٔ درخواست‌هایش را حذف می‌کند. برگشت‌پذیر نیست، پس اول از شخص تأیید بگیرید.',
    'catalog.tool.agent_list':
        'ایجنت‌های این پروژه را فهرست می‌کند: شناسه، نام، کاری که می‌کنند، مدلشان، اجازه‌هایشان و تعداد فایل‌های دستورالعملشان.',
    'catalog.tool.agent_create':
        'یک ایجنت می‌سازد. با فایل‌ها و اجازه‌های پیش‌فرض شروع می‌کند؛ با agent_file_write و agent_permissions شکلش دهید.',
    'catalog.tool.agent_update':
        'نام، توضیح یا مدل یک ایجنت را تغییر می‌دهد. فقط چیزهایی که داده شوند تغییر می‌کنند.',
    'catalog.tool.agent_delete':
        'یک ایجنت را با فایل‌هایش حذف می‌کند؛ ربات‌هایش دیگر پاسخ نمی‌دهند و وظیفه‌های زمان‌بندی‌شده‌اش لغو می‌شوند. برگشت‌پذیر نیست، پس اول از شخص تأیید بگیرید.',
    'catalog.tool.agent_permissions':
        'همهٔ کارهایی را که یک ایجنت اجازه دارد، به صورت فهرست کامل تازهٔ کلیدهای اجازه تعیین می‌کند. نمی‌توانید اجازه‌های خودتان را تغییر دهید یا اجازه‌ای بدهید که خودتان ندارید.',
    'catalog.tool.agent_files': 'فایل‌های دستورالعمل یک ایجنت را با اندازه‌شان فهرست می‌کند.',
    'catalog.tool.agent_file_read': 'یکی از فایل‌های دستورالعمل یک ایجنت را می‌خواند.',
    'catalog.tool.agent_file_write':
        'یک فایل دستورالعمل برای ایجنت می‌سازد یا کل محتوای آن را جایگزین می‌کند.',
    'catalog.tool.agent_file_delete':
        'یکی از فایل‌های دستورالعمل یک ایجنت را حذف می‌کند. برگشت‌پذیر نیست، پس اول از شخص تأیید بگیرید.',
    'catalog.tool.model_list':
        'مدل‌های این پروژه را فهرست می‌کند: شناسه، نام، شناسهٔ مدل، نشانی، اندازهٔ پنجرهٔ توکن و اینکه کلید تنظیم شده یا نه. کلیدها هرگز نشان داده نمی‌شوند.',
    'catalog.tool.model_create':
        'مدلی را که با API گفتگوی OpenAI کار می‌کند اضافه می‌کند. پس از ذخیره آزمایش می‌شود.',
    'catalog.tool.model_update':
        'یک مدل را تغییر می‌دهد. فقط چیزهایی که داده شوند تغییر می‌کنند؛ کلید نگه داشته می‌شود مگر کلید تازه بدهید.',
    'catalog.tool.model_test': 'بررسی می‌کند که یک مدل پاسخ می‌دهد و آن مدل را می‌شناسد.',
    'catalog.tool.model_delete':
        'یک مدل را حذف می‌کند؛ ایجنت‌هایی که از آن استفاده می‌کردند بی‌مدل می‌مانند. برگشت‌پذیر نیست، پس اول از شخص تأیید بگیرید.',
    'catalog.tool.bot_list':
        'ربات‌های تلگرام این پروژه را فهرست می‌کند: شناسه، نام، ایجنتی که پاسخ می‌دهد، خواندن گروه‌ها، کسانی که به آن‌ها پاسخ می‌دهد و اینکه توکن تنظیم شده یا نه. توکن‌ها هرگز نشان داده نمی‌شوند.',
    'catalog.tool.bot_create':
        'یک ربات تلگرام را با توکنش از @BotFather اضافه می‌کند و در صورت نیاز ایجنتی را که به آن پاسخ می‌دهد تعیین می‌کند.',
    'catalog.tool.bot_update': 'یک ربات را تغییر می‌دهد. فقط چیزهایی که داده شوند تغییر می‌کنند.',
    'catalog.tool.bot_test':
        'بررسی می‌کند که توکن یک ربات کار می‌کند و نام کاربری ربات را نشان می‌دهد.',
    'catalog.tool.bot_delete':
        'یک ربات تلگرام را از این پروژه حذف می‌کند. برگشت‌پذیر نیست، پس اول از شخص تأیید بگیرید.',
    'catalog.tool.people_list':
        'افرادی را که به ربات‌های این پروژه پیام داده‌اند فهرست می‌کند: شناسهٔ پروفایل، نام، نام کاربری، کارهایی که اجازه دارند، تعداد پیام‌ها و آخرین بازدید.',
    'catalog.tool.person_permissions':
        'کارهایی را که یک شخص اجازه دارد به صورت فهرست کامل تازه تعیین می‌کند: chat (نوشتن به ربات‌ها)، model (پاسخ گرفتن از مدل)، delegate (سپردن درخواست‌ها به ایجنت‌های دیگر).',
    'catalog.tool.activity_list':
        'فعالیت‌های این پروژه را از تازه‌ترین می‌خواند: چه اتفاقی افتاد، نتیجه و زمانش.',
    'catalog.tool.overview':
        'آمار این پروژه در روز و هفتهٔ گذشته: افراد، گفتگوها، پیام‌ها، درخواست‌های مدل، خطاها و توکن‌های هر مدل.',
    'catalog.tool.browser_post':
        'با مرورگری که با حساب وارد شده، در X، اینستاگرام یا تلگرام یک پست منتشر می‌کند. اینستاگرام تصویر لازم دارد. پست‌های یک حساب باید دست‌کم دو دقیقه فاصله داشته باشند. دقیقاً بگویید چه منتشر شد، یا خطا چه بود.',
    'catalog.tool.team_member_chat':
        'گفتگو با مدل را برای یکی از اعضای تیم روشن یا خاموش می‌کند تا به پیام‌هایش پاسخ داده شود یا نشود. فقط وقتی کار می‌کند که کسی که درخواست می‌دهد در team.json نقشی داشته باشد؛ اگر رد شد، به او بگویید. از member_id فهرست team_members استفاده کنید.',
    'catalog.tool.web_search':
        'برای اطلاعات روز در وب جستجو می‌کند: خبر، واقعیت، قیمت، ساعت کاری و هر چیزی که از قبل نمی‌دانید. عنوان، پیوند و خلاصه‌ای کوتاه برمی‌گرداند؛ متن کامل هر نتیجه را با web_fetch بخوانید.',
    'catalog.tool.weather':
        'وضع هوای فعلی و پیش‌بینی یک مکان به نام آن: دما، وضعیت، باد، رطوبت و بارش. برای هر پرسش دربارهٔ هوا از این استفاده کنید، نه از جستجو.',
    'catalog.tool.web_fetch':
        'یک صفحهٔ عمومی وب یا پاسخ یک API را به‌صورت متن می‌خواند. اگر نشانی را ندارید، اول با web_search پیدایش کنید. فقط نشانی‌های عمومی کار می‌کنند؛ نشانی‌های خصوصی و داخلی همیشه رد می‌شوند.',
    'catalog.tool.agent_call':
        'درخواستی را به ایجنت دیگری در این پروژه می‌سپارد. آن ایجنت با ابزارهای خودش انجامش می‌دهد و می‌گوید چه کرد. وقتی کسی چیزی می‌خواهد که ایجنت دیگری می‌تواند انجام دهد و شما نمی‌توانید، مثل افزودن کسی به تیم، از این استفاده کنید. آن ایجنت این گفتگو را نمی‌بیند، پس همهٔ جزئیات لازم را در درخواست بگذارید.',
    'catalog.tool.time_now':
        'تاریخ و ساعت فعلی به وقت UTC. به‌جای حدس زدن روز، از این استفاده کنید.',
    'catalog.tool.roster_read':
        'team.json را می‌خواند: افراد این تیم با نقش‌ها، توضیح و شناسه‌های عمومی‌شان. پیش از پاسخ به پرسش دربارهٔ اینکه کسی کیست یا چه می‌کند، از آن استفاده کنید.',
    'catalog.tool.roster_member_create':
        'شخص تازه‌ای به team.json اضافه می‌کند. اگر کسی با همین نام در تیم باشد رد می‌شود؛ برای تغییر او از roster_member_update استفاده کنید.',
    'catalog.tool.roster_member_update':
        'آنچه team.json دربارهٔ یکی از اعضا می‌گوید تغییر می‌دهد. فقط فیلدهایی که می‌فرستید تغییر می‌کنند، پس می‌توانید نقش‌ها را بدون دست زدن به توضیح تنظیم کنید؛ شناسه‌ها با آنچه ثبت شده ادغام می‌شوند. roles کل فهرست نقش‌ها را جایگزین می‌کند، پس همهٔ نقش‌هایی را که باید بمانند بفرستید. برای تغییر نام، new_name را بفرستید. اگر لازم است بدانید چه چیزی ثبت شده، اول از roster_read استفاده کنید.',
    'catalog.tool.roster_member_delete':
        'شخصی را از team.json حذف می‌کند. فقط وقتی از شما خواسته شد از آن استفاده کنید؛ این تنها کاری در team.json است که اطلاعات را از بین می‌برد.',
    'catalog.tool.document_read':
        'یکی از فایل‌های مرجع خودتان را به نام می‌خواند، مثلاً knowledge.md. فایل‌هایی که می‌توانید باز کنید در انتهای دستورالعمل‌هایتان فهرست شده‌اند.',
    'catalog.tool.telegram_send_message':
        'از طریق ربات تلگرامِ متصل پیام می‌فرستد: پستی در کانال، پیامی در گروه، یا پیامی به کسی که به ربات پیام داده است. Markdown تبدیل می‌شود. برای پاسخ به پیامی خاص، reply_to را بفرستید.',
    'catalog.tool.telegram_send_photo':
        'از طریق ربات تلگرامِ متصل تصویری با توضیح اختیاری منتشر می‌کند. تصویر باید در یک نشانی عمومی https باشد.',
    'catalog.tool.telegram_send_poll': 'از طریق ربات تلگرامِ متصل یک نظرسنجی منتشر می‌کند.',
    'catalog.tool.telegram_edit_message': 'متن پیامی را که ربات تلگرام قبلاً فرستاده تغییر می‌دهد.',
    'catalog.tool.telegram_delete_message':
        'پیامی را در گفتگویی که ربات تلگرام اجازهٔ حذف در آن دارد حذف می‌کند.',
    'catalog.tool.telegram_pin_message':
        'پیامی را در گفتگویی که ربات تلگرام مدیر آن است سنجاق می‌کند.',
    'catalog.tool.telegram_chat_info':
        'عنوان، نوع، توضیح و تعداد اعضای یک گفتگوی تلگرام را می‌خواند.',
    'catalog.tool.telegram_react':
        'با یک ایموجی به پیام تلگرام واکنش نشان می‌دهد، مثل یک لایک. تلگرام فقط ایموجی‌های واکنش استاندارد خودش را می‌پذیرد، مثل 👍 ❤ 🔥 🎉 👏.',
    'catalog.tool.x_post':
        'از حساب متصل پستی در X منتشر می‌کند. برای پاسخ به یک پست reply_to و برای نقل آن quote را بفرستید. حداکثر ۲۸۰ نویسه، و هر پیوند ۲۳ نویسه حساب می‌شود.',
    'catalog.tool.x_like': 'پستی را در X لایک می‌کند، یا با undo لایک را پس می‌گیرد.',
    'catalog.tool.x_repost': 'پستی را در X بازنشر می‌کند، یا بازنشر را پس می‌گیرد.',
    'catalog.tool.x_delete': 'پستی را که حساب X متصل منتشر کرده حذف می‌کند.',
    'catalog.tool.x_read_post':
        'یک پست X را با نویسنده، زمان و تعداد لایک، بازنشر و پاسخ‌هایش می‌خواند.',
    'catalog.tool.x_mentions':
        'آخرین پست‌هایی که از حساب X متصل نام برده‌اند، جدیدترین اول، برای بررسی و پاسخ.',
    'catalog.tool.x_my_posts':
        'آخرین پست‌های حساب X متصل با لایک‌ها، بازنشرها و پاسخ‌هایشان، برای دیدن آنچه قبلاً گفته است.',
    'catalog.tool.x_search':
        'در پست‌های هفت روز اخیر X جستجو می‌کند، مثلاً "blockchain -is:retweet lang:en".',
    'catalog.tool.discord_send_message':
        'از طریق ربات متصل پیامی به یک کانال دیسکورد می‌فرستد. برای پاسخ به پیامی خاص، reply_to را بفرستید.',
    'catalog.tool.discord_edit_message': 'پیامی را که ربات دیسکورد قبلاً فرستاده تغییر می‌دهد.',
    'catalog.tool.discord_delete_message':
        'پیامی را در کانالی از دیسکورد که ربات می‌تواند مدیریتش کند حذف می‌کند.',
    'catalog.tool.discord_react': 'به پیامی در دیسکورد با ایموجی واکنش نشان می‌دهد.',
    'catalog.tool.discord_create_thread':
        'در یک کانال دیسکورد رشته‌گفتگو (thread) باز می‌کند؛ اگر message_id داده شود، از روی همان پیام.',
    'catalog.tool.discord_read_messages':
        'آخرین پیام‌های یک کانال دیسکورد را، جدیدترین اول، می‌خواند. برای دیدن متن پیام‌ها، intent مربوط به Message Content باید برای ربات روشن باشد.',
    'catalog.tool.discord_list_channels':
        'سرورهایی که ربات دیسکورد در آن‌هاست و کانال‌های متنی‌شان را، همراه با شناسه‌هایی برای استفاده در بقیهٔ ابزارهای دیسکورد، فهرست می‌کند.',
    'catalog.tool.instagram_publish':
        'در حساب اینستاگرام متصل پست منتشر می‌کند: یک تصویر (image_url)، یک ریل (video_url) یا یک کاروسل (image_urls، ۲ تا ۱۰). رسانه‌ها باید در نشانی‌های عمومی https باشند و تصویرها باید JPEG باشند.',
    'catalog.tool.instagram_list_media':
        'آخرین پست‌های حساب اینستاگرام متصل را با شناسه، کپشن، تعداد لایک و کامنت فهرست می‌کند.',
    'catalog.tool.instagram_list_comments':
        'کامنت‌های یک پست اینستاگرام را می‌خواند. media_id را از instagram_list_media بگیرید.',
    'catalog.tool.instagram_reply_comment':
        'به‌طور عمومی به کامنتی روی یکی از پست‌های حساب پاسخ می‌دهد.',
    'catalog.tool.instagram_comment':
        'روی یکی از پست‌های حساب کامنت می‌گذارد. اینستاگرام فقط اجازه می‌دهد حساب روی پست‌های خودش یا جایی که از آن نام برده شده کامنت بگذارد. media_id را از instagram_list_media بگیرید.',
    'catalog.tool.instagram_hide_comment':
        'کامنتی را روی یکی از پست‌های حساب پنهان می‌کند، یا دوباره نشانش می‌دهد.',
    'catalog.tool.instagram_send_message':
        'به کسی که در ۲۴ ساعت گذشته به حساب اینستاگرام پیام داده پیام مستقیم می‌فرستد.',
    'catalog.tool.instagram_profile':
        'حساب اینستاگرام متصل را می‌خواند: نام کاربری، دنبال‌کننده‌ها، دنبال‌شونده‌ها و تعداد پست‌ها.',
    'catalog.tool.browser_search':
        'با مرورگر پروژه در وب جستجو می‌کند. عنوان، پیوند و خلاصه برمی‌گرداند؛ هر نتیجه را با browser_open باز کنید.',
    'catalog.tool.browser_open':
        'یک صفحهٔ عمومی وب را باز می‌کند و آن را همراه با پیوندهایش به‌صورت متن می‌خواند. صفحه‌های بلند در چند بخش می‌آیند: برای خواندن ادامه، next_offset آخرین فراخوانی را بفرستید.',
    'catalog.tool.webhook_send':
        'رویدادی را به نشانی‌ای که پلاگین وب‌هوک به آن اشاره می‌کند می‌فرستد، مثلاً یک اتوماسیون در n8n، Zapier یا Make.',

    'catalog.permission.chat.label': 'گفتگو',
    'catalog.permission.chat.description':
        'می‌تواند به ربات‌های تیم پیام بدهد. بدون آن، دریافت پیام‌ها به تلگرام اعلام می‌شود اما ثبت نمی‌شوند.',
    'catalog.permission.model.label': 'گفتگو با مدل',
    'catalog.permission.model.description':
        'پیام‌هایش با مدلی که برای تیم تنظیم شده پاسخ داده می‌شود.',
    'catalog.permission.delegate.label': 'درخواست از ایجنت‌های دیگر',
    'catalog.permission.delegate.description':
        'ایجنتی که با او گفتگو می‌کند می‌تواند درخواستش را به ایجنت دیگری از این پروژه بسپارد تا با قابلیت‌های خودش انجامش دهد، مثل افزودن کسی به team.json.',

    'catalog.kind.telegram.label': 'تلگرام',
    'catalog.kind.telegram.description':
        'از طریق یک ربات در کانال‌ها و گروه‌ها پست می‌گذارد، تصویر و نظرسنجی می‌فرستد، و به پیام‌ها پاسخ می‌دهد، آن‌ها را ویرایش، سنجاق و حذف می‌کند. می‌تواند به کسانی که به ربات پیام می‌دهند هم پاسخ دهد.',
    'catalog.kind.telegram.inbound_hint':
        'به پیام‌های خصوصی، و در گروه‌ها به پیام‌هایی که ربات را منشن می‌کنند یا به آن پاسخ می‌دهند، جواب می‌دهد. رباتی که قبلاً در بخش ربات‌ها اضافه شده، به‌جای این از همان‌جا پاسخ می‌دهد.',
    'catalog.kind.telegram.field.token.label': 'توکن ربات',
    'catalog.kind.telegram.field.token.hint':
        'از ‎@BotFather. برای اینکه ربات در یک کانال پست بگذارد، آن را مدیر کانال کنید.',
    'catalog.kind.telegram.field.default_chat.label': 'گفتگوی پیش‌فرض',
    'catalog.kind.telegram.field.default_chat.hint':
        'وقتی ایجنت گفتگویی را نام نبرد استفاده می‌شود: ‎@channelname یا شناسهٔ یک گفتگو.',
    'catalog.kind.relay.label': 'بازنشر کانال',
    'catalog.kind.relay.description':
        'یک کانال تلگرام را زیر نظر می‌گیرد و هر پست تازه را به دست یک ایجنت، مطابق دستور شما بازنویسی می‌کند و نتیجه را در یک گروه می‌فرستد.',
    'catalog.kind.relay.inbound_hint':
        'این ایجنت هر پست تازه را بازنویسی می‌کند. اگر ربات مدیر کانال باشد پست‌ها بی‌درنگ می‌رسند؛ وگرنه کانال باید عمومی باشد و صفحهٔ آن هر دو دقیقه خوانده می‌شود.',
    'catalog.kind.relay.field.token.label': 'توکن ربات',
    'catalog.kind.relay.field.token.hint':
        'از ‎@BotFather. ربات را به گروهی که در آن پست می‌گذارد اضافه کنید. از رباتی استفاده کنید که در بخش ربات‌ها یا پلاگین دیگری نیست.',
    'catalog.kind.relay.field.source.label': 'کانالی که زیر نظر است',
    'catalog.kind.relay.field.source.hint':
        '‎@channelname یا پیوند t.me آن. برای کانال خصوصی، ربات را مدیر کانال کنید و شناسهٔ کانال را بدهید.',
    'catalog.kind.relay.field.target.label': 'گروهی که در آن پست می‌گذارد',
    'catalog.kind.relay.field.target.hint':
        'شناسهٔ گروه، مثل ‎-1001234567890، یا ‎@groupname برای گروه عمومی.',
    'catalog.kind.relay.field.brief.label': 'چگونه بازنویسی شود',
    'catalog.kind.relay.field.brief.hint':
        'کاری که ایجنت با هر پست می‌کند؛ مثلاً آن را به کدام پروژه ربط دهد و چقدر کوتاه باشد.',
    'catalog.kind.voice.label': 'تبدیل گفتار به متن',
    'catalog.kind.voice.description':
        'پیام‌های صوتی‌ای را که مردم برای ربات‌هایتان می‌فرستند به متن تبدیل می‌کند تا ایجنت بتواند طبق حرفشان کار کند. با هر سرویس تبدیل گفتار سازگار با OpenAI، مثل OpenAI یا Groq، کار می‌کند.',
    'catalog.kind.voice.field.base_url.label': 'نشانی سرویس',
    'catalog.kind.voice.field.base_url.hint':
        'OpenAI: ‎https://api.openai.com/v1. Groq: ‎https://api.groq.com/openai/v1.',
    'catalog.kind.voice.field.api_key.label': 'کلید API',
    'catalog.kind.voice.field.api_key.hint': 'کلید همان سرویس.',
    'catalog.kind.voice.field.model.label': 'مدل',
    'catalog.kind.voice.field.model.hint':
        'OpenAI: ‎whisper-1 یا gpt-4o-mini-transcribe. Groq: ‎whisper-large-v3-turbo.',
    'catalog.kind.voice.field.language.label': 'زبان',
    'catalog.kind.voice.field.language.hint':
        'اختیاری: وقتی همه به یک زبان صحبت می‌کنند، یک کد دوحرفی مثل fa یا en. برای تشخیص خودکار زبان خالی بگذارید.',
    'catalog.kind.poster.label': 'انتشار با مرورگر',
    'catalog.kind.poster.description':
        'با یک مرورگر واقعی که با حساب شما وارد شده، در X، اینستاگرام یا تلگرام پست می‌گذارد؛ برای حساب‌هایی که دسترسی API ندارند. این سایت‌ها ممکن است حساب‌هایی را که خودکار می‌بینند مسدود کنند، پس کم پست بگذارید.',
    'catalog.kind.poster.field.site.label': 'سایت',
    'catalog.kind.poster.field.site.hint': 'x، instagram یا telegram.',
    'catalog.kind.poster.field.session.label': 'نشست واردشده',
    'catalog.kind.poster.field.session.hint':
        'روی رایانه‌ای با صفحه‌نمایش npm run browser:login -- x (یا instagram، telegram) را اجرا کنید، وارد حسابتان شوید، سپس فایلی را که ذخیره می‌کند اینجا بچسبانید و آن فایل را پاک کنید.',
    'catalog.kind.poster.field.chat.label': 'گفتگوی تلگرام',
    'catalog.kind.poster.field.chat.hint':
        'فقط برای تلگرام: کانال یا گروهی که در آن پست گذاشته شود، مثل ‎@mychannel.',
    'catalog.kind.x.label': 'X',
    'catalog.kind.x.description':
        'در X پست می‌گذارد، پاسخ می‌دهد، نقل می‌کند، لایک و بازنشر و حذف می‌کند، و منشن‌ها، جستجوها و پست‌ها را می‌خواند. هر درخواست از اعتبار API ایکس کم می‌کند.',
    'catalog.kind.x.field.api_key.label': 'کلید API',
    'catalog.kind.x.field.api_key.hint':
        'در developer console ایکس، اپ شما، بخش Keys and tokens: همان consumer key.',
    'catalog.kind.x.field.api_secret.label': 'رمز کلید API',
    'catalog.kind.x.field.api_secret.hint': 'کنار کلید API نشان داده می‌شود.',
    'catalog.kind.x.field.access_token.label': 'توکن دسترسی',
    'catalog.kind.x.field.access_token.hint':
        'اول اپ را روی Read and write بگذارید، سپس توکن را برای حسابی که پست می‌گذارد بسازید.',
    'catalog.kind.x.field.access_secret.label': 'رمز توکن دسترسی',
    'catalog.kind.x.field.access_secret.hint': 'همراه توکن دسترسی نشان داده می‌شود.',
    'catalog.kind.discord.label': 'دیسکورد',
    'catalog.kind.discord.description':
        'در کانال‌های دیسکورد پست می‌گذارد، پاسخ می‌دهد، واکنش نشان می‌دهد، ویرایش و حذف می‌کند و رشته‌گفتگو باز می‌کند، و آنچه آنجا گفته شده را می‌خواند. می‌تواند به منشن‌ها و پیام‌های مستقیم هم پاسخ دهد.',
    'catalog.kind.discord.inbound_hint':
        'به پیام‌های مستقیم و پیام‌هایی که ربات را منشن می‌کنند پاسخ می‌دهد. برای خواندن تاریخچهٔ کانال، intent مربوط به Message Content باید در developer portal دیسکورد روشن باشد.',
    'catalog.kind.discord.field.token.label': 'توکن ربات',
    'catalog.kind.discord.field.token.hint':
        'در developer portal دیسکورد، بخش Bot، گزینهٔ Reset Token. ربات را با اجازهٔ Send Messages دعوت کنید.',
    'catalog.kind.discord.field.default_channel.label': 'شناسهٔ کانال پیش‌فرض',
    'catalog.kind.discord.field.default_channel.hint':
        'وقتی ایجنت کانالی را نام نبرد استفاده می‌شود. با روشن بودن developer mode، روی کانال راست‌کلیک کنید و Copy ID را بزنید.',
    'catalog.kind.instagram.label': 'اینستاگرام',
    'catalog.kind.instagram.description':
        'در یک حساب حرفه‌ای تصویر، ریل و کاروسل منتشر می‌کند، کامنت‌ها را می‌خواند، پاسخ می‌دهد و پنهان می‌کند، و به پیام‌های مستقیم جواب می‌دهد.',
    'catalog.kind.instagram.inbound_hint':
        'در داشبورد اپ Meta، وب‌هوک اینستاگرام را با verify token به نشانی زیر وصل کنید و comments و messages را مشترک شوید. برای اعتماد به آنچه می‌رسد، app secret لازم است.',
    'catalog.kind.instagram.field.token.label': 'توکن دسترسی',
    'catalog.kind.instagram.field.token.hint':
        'یک توکن دسترسی کاربر اینستاگرام از داشبورد اپ Meta، با اجازه‌های انتشار محتوا، کامنت و پیام.',
    'catalog.kind.instagram.field.app_secret.label': 'رمز اپ (App secret)',
    'catalog.kind.instagram.field.app_secret.hint':
        'فقط برای پاسخ به کامنت‌ها و پیام‌ها لازم است: ثابت می‌کند فراخوانی وب‌هوک از طرف Meta آمده است.',
    'catalog.kind.browser.label': 'مرورگر وب',
    'catalog.kind.browser.description':
        'از روی سرور در وب جستجو می‌کند و صفحه‌ها را بخش‌بخش همراه با پیوندهایشان می‌خواند. نشانی‌های خصوصی و داخلی همیشه رد می‌شوند.',
    'catalog.kind.browser.field.tavily_key.label': 'کلید API برای Tavily',
    'catalog.kind.browser.field.tavily_key.hint':
        'اختیاری، رایگان در tavily.com. بدون آن، جستجو به Bing، DuckDuckGo و Wikipedia برمی‌گردد که کمتر قابل‌اعتمادند.',
    'catalog.kind.browser.field.blocked_domains.label': 'سایت‌های مسدود',
    'catalog.kind.browser.field.blocked_domains.hint':
        'با ویرگول جدا کنید. این سایت‌ها و زیردامنه‌هایشان هرگز جستجو یا باز نمی‌شوند.',
    'catalog.kind.webhook.label': 'وب‌هوک',
    'catalog.kind.webhook.description':
        'رویدادها را به هر نشانی‌ای، مثل n8n، Zapier یا Make، می‌فرستد و به سیستم‌های دیگر اجازه می‌دهد با فراخوانی این پروژه از یک ایجنت چیزی بپرسند.',
    'catalog.kind.webhook.inbound_hint':
        'یک JSON با فیلد text به نشانی زیر POST کنید و رمز را در هدر x-nura-secret بگذارید. پاسخ در همان جواب برمی‌گردد.',
    'catalog.kind.webhook.field.url.label': 'ارسال به',
    'catalog.kind.webhook.field.url.hint':
        'جایی که webhook_send به آن پست می‌کند. هر درخواست با رمز زیر در x-nura-signature امضا می‌شود.',
    'catalog.kind.webhook.field.authorization.label': 'هدر Authorization',
    'catalog.kind.webhook.field.authorization.hint':
        'اختیاری، عیناً همراه هر درخواست فرستاده می‌شود، مثلاً Bearer abc123.',

    'catalog.provider.openrouter.label': 'OpenRouter · یک کلید، همهٔ مدل‌ها',
    'catalog.provider.openrouter.hint':
        'یک کلید به صدها مدل می‌رسد. فهرست زیر از OpenRouter دریافت می‌شود.',
    'catalog.provider.agentrouter.label': 'AgentRouter · سهمیهٔ رایگان برای مدل‌های برنامه‌نویسی',
    'catalog.provider.agentrouter.hint':
        'یک روتر میزبانی‌شده با سهمیهٔ رایگان، اما فقط برنامه‌های کلاینتی را که می‌شناسد می‌پذیرد و بقیه را با خطای 401 رد می‌کند؛ کلید معتبر کافی نیست. مدل‌های Claude آن هم از پروتکل Anthropic روی ریشهٔ دیگری استفاده می‌کنند و از اینجا در دسترس نیستند.',
    'catalog.provider.custom.label': 'اندپوینت سازگار با OpenAI دیگر',
    'catalog.provider.custom.hint':
        'هر ریشهٔ سازگار با OpenAI، از جمله مدلی که به‌صورت محلی اجرا می‌شود.',

    'catalog.action.account.create': 'ساخت حساب',
    'catalog.action.account.sign_in': 'ورود به حساب',
    'catalog.action.agent.call': 'درخواست از ایجنت دیگر',
    'catalog.action.agent.create': 'ساخت ایجنت',
    'catalog.action.agent.document.create': 'ساخت فایل ایجنت',
    'catalog.action.agent.document.remove': 'حذف فایل ایجنت',
    'catalog.action.agent.document.update': 'ویرایش فایل ایجنت',
    'catalog.action.agent.file.append': 'افزودن به فایل شخص',
    'catalog.action.agent.file.write': 'نوشتن فایل شخص',
    'catalog.action.agent.member_note': 'یادداشت دربارهٔ عضو',
    'catalog.action.agent.permissions': 'قابلیت‌های ایجنت',
    'catalog.action.agent.remove': 'حذف ایجنت',
    'catalog.action.agent.reply': 'پاسخ ایجنت',
    'catalog.action.agent.request': 'درخواست به ایجنت',
    'catalog.action.agent.roster': 'تغییر team.json توسط ایجنت',
    'catalog.action.agent.tool': 'فراخوانی ابزار',
    'catalog.action.agent.update': 'ویرایش ایجنت',
    'catalog.action.bot.create': 'اتصال ربات',
    'catalog.action.bot.remove': 'حذف ربات',
    'catalog.action.bot.test': 'آزمایش ربات',
    'catalog.action.bot.update': 'ویرایش ربات',
    'catalog.action.bot.webhook': 'ثبت وب‌هوک ربات',
    'catalog.action.model.call': 'فراخوانی مدل',
    'catalog.action.model.create': 'افزودن مدل',
    'catalog.action.model.probe': 'بررسی اندپوینت',
    'catalog.action.model.remove': 'حذف مدل',
    'catalog.action.model.test': 'آزمایش مدل',
    'catalog.action.model.update': 'ویرایش مدل',
    'catalog.action.plugin.action': 'کار پلاگین',
    'catalog.action.plugin.create': 'افزودن پلاگین',
    'catalog.action.plugin.inbound': 'دریافت از پلاگین',
    'catalog.action.plugin.relay': 'بازنشر پست کانال',
    'catalog.action.plugin.remove': 'حذف پلاگین',
    'catalog.action.plugin.reply': 'پاسخ از طریق پلاگین',
    'catalog.action.plugin.test': 'آزمایش پلاگین',
    'catalog.action.plugin.update': 'ویرایش پلاگین',
    'catalog.action.profile.permissions': 'دسترسی‌های شخص',
    'catalog.action.roster.member': 'ذخیرهٔ عضو تیم',
    'catalog.action.roster.write': 'ذخیرهٔ team.json',
    'catalog.action.task.cancel': 'لغو وظیفه',
    'catalog.action.task.create': 'ساخت وظیفه',
    'catalog.action.task.remove': 'حذف وظیفه',
    'catalog.action.task.run': 'اجرای وظیفه',
    'catalog.action.task.run_now': 'اجرای فوری وظیفه',
    'catalog.action.task.schedule': 'زمان‌بندی وظیفه',
    'catalog.action.task.update': 'ویرایش وظیفه',
    'catalog.action.team.archive': 'بایگانی پروژه',
    'catalog.action.team.create': 'ساخت پروژه',
    'catalog.action.team.export': 'خروجی گرفتن از پروژه',
    'catalog.action.team.import': 'وارد کردن پروژه',
    'catalog.action.team.remove': 'حذف پروژه',
    'catalog.action.team.unarchive': 'بازگردانی پروژه',
    'catalog.action.team.update': 'ویرایش پروژه',
    'catalog.action.telegram.message': 'پیام تلگرام',

    'catalog.role.ceo.name': 'مدیرعامل',
    'catalog.role.ceo.description':
        'مسیر را تعیین می‌کند، بده‌بستان‌ها را می‌سنجد و هدف‌ها را به اولویت تبدیل می‌کند.',
    'catalog.role.cto.name': 'مدیر فنی',
    'catalog.role.cto.description':
        'مسئول مسیر فنی است: معماری، انتخاب فناوری، امنیت و بده‌بستان‌های مهندسی.',
    'catalog.role.engineer.name': 'مهندس نرم‌افزار',
    'catalog.role.engineer.description':
        'کد می‌نویسد، بازبینی و اشکال‌زدایی می‌کند و مشکلات فنی را ساده توضیح می‌دهد.',
    'catalog.role.product.name': 'مدیر محصول',
    'catalog.role.product.description':
        'درخواست‌ها را به مسئله‌های روشن، اولویت‌ها و مشخصاتی تبدیل می‌کند که تیم بتواند بسازد.',
    'catalog.role.marketing.name': 'مدیر بازاریابی',
    'catalog.role.marketing.description':
        'جایگاه‌یابی، پیام، عرضه و کمپین‌هایی که محصول را قابل‌فهم می‌کنند.',
    'catalog.role.omm.name': 'مدیر بازاریابی آنلاین',
    'catalog.role.omm.description':
        'کانال‌های دیجیتال را اداره می‌کند: تبلیغات پولی، ایمیل، قیف فروش و عددهای پشت آن‌ها.',
    'catalog.role.seo.name': 'متخصص سئو',
    'catalog.role.seo.description':
        'کلیدواژه‌ها، ساختار صفحه و محتوایی که رتبه می‌گیرد، بدون ترفندهایی که جریمه به دنبال دارند.',
    'catalog.role.social.name': 'مدیر شبکه‌های اجتماعی',
    'catalog.role.social.description':
        'برای X، اینستاگرام، تلگرام و دیسکورد با یک لحن ثابت پست می‌نویسد.',
    'catalog.role.community.name': 'مدیر جامعه',
    'catalog.role.community.description':
        'به اعضا خوش‌آمد می‌گوید، به پرسش‌ها پاسخ می‌دهد و گروه‌ها را دوستانه و مرتبط نگه می‌دارد.',
    'catalog.role.support.name': 'پشتیبانی مشتری',
    'catalog.role.support.description':
        'با حوصله به پرسش‌های مشتری پاسخ می‌دهد، آنچه را می‌تواند حل می‌کند و بقیه را ارجاع می‌دهد.',
};

export default messages;
