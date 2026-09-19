import 'dotenv/config';

const builder = (name: string) =>
{
    const value = process.env[name];

    if (value === undefined)
    {
        throw new TypeError(`Missing required environment variable: ${ name }`);
    }

    const asNumber = () =>
    {
        const result = Number.parseInt(value, 10);

        if (Number.isNaN(result))
        {
            throw new TypeError(`Invalid value for environment variable: ${ name } - ${ typeof value } - ${ value }`);
        }

        return result;
    };

    const asString = () =>
    {
        return value;
    };

    const asStringArray = () =>
    {
        return value.split(',');
    };

    const asNumberArray = () =>
    {
        return value
            .split(',')
            .map((item) => item.trim())
            .map((item) =>
            {
                const valueAsNumber = Number(item);

                if (isNaN(valueAsNumber))
                {
                    throw new TypeError(`Invalid value for environment variable: ${ name } - ${ typeof value } - ${ value }`);
                }

                return valueAsNumber;
            });
    };

    const asBoolean = () =>
    {
        switch (value.toLowerCase())
        {
            case '1':
            case 'yes':
            case 'true':
            {
                return true;
            }
            case '0':
            case 'no':
            case 'false':
            {
                return false;
            }
            default:
            {
                throw new TypeError(`Invalid value for environment variable: ${ name } - ${ typeof value } - ${ value }`);
            }
        }
    };

    function asDuration()
    {
        if (typeof value !== 'string')
        {
            throw new TypeError(`Invalid value for environment variable: ${ name } - ${ typeof value } - ${ value }`);
        }

        const match = value.trim().toLowerCase().match(/^(\d+)([dhms])$/);

        if (match === null)
        {
            throw new TypeError(`Invalid format for environment variable: ${ name } - 1s 60m 24h 30d - ${ value }`);
        }

        const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

        if (!(match[2] in multipliers))
        {
            throw new TypeError(`Invalid format type for environment variable: ${ name } - s m h d - ${ value }`);
        }

        return Number.parseInt(match[1], 10) * multipliers[match[2]];
    }

    return { asNumber, asString, asStringArray, asNumberArray, asBoolean, asDuration };
};

const NODE_PORT = builder('NODE_PORT').asNumber();

const NODE_ENV = (() =>
{
    const value = builder('NODE_ENV').asString();

    if (![ 'development', 'production' ].includes(value))
    {
        throw new TypeError(`Invalid format type for environment variable: NODE_ENV - ${ value }`);
    }

    return value as 'development' | 'production';
})();

const NODE_RECOVERY_TIME = builder('NODE_RECOVERY_TIME').asDuration();
const NODE_COOKIE = builder('NODE_COOKIE').asString();

const MAIL_SERVICE = builder('MAIL_SERVICE').asString();
const MAIL_HOST = builder('MAIL_HOST').asString();
const MAIL_PORT = builder('MAIL_PORT').asNumber();
const MAIL_USERNAME = builder('MAIL_USERNAME').asString();
const MAIL_PASSWORD = builder('MAIL_PASSWORD').asString();
const MAIL_FROM = builder('MAIL_FROM').asString();

const DB_WEB_TYPE = builder('DB_WEB_TYPE').asString();
const DB_WEB_HOST = builder('DB_WEB_HOST').asString();
const DB_WEB_PORT = builder('DB_WEB_PORT').asNumber();
const DB_WEB_USERNAME = builder('DB_WEB_USERNAME').asString();
const DB_WEB_PASSWORD = builder('DB_WEB_PASSWORD').asString();
const DB_WEB_DATABASE = builder('DB_WEB_DATABASE').asString();
const DB_WEB_SYNC = builder('DB_WEB_SYNC').asBoolean();
const DB_WEB_LOG = builder('DB_WEB_LOG').asBoolean();

const SOAP_HOST = builder('SOAP_HOST').asStringArray();
const SOAP_PORT = builder('SOAP_PORT').asNumberArray();
const SOAP_USERNAME = builder('SOAP_USERNAME').asStringArray();
const SOAP_PASSWORD = builder('SOAP_PASSWORD').asStringArray();

const SESSION_ACCESS_TIME = builder('SESSION_ACCESS_TIME').asDuration();
const SESSION_ACCESS_SECRET = builder('SESSION_ACCESS_SECRET').asString();

const SESSION_REFRESH_TIME = builder('SESSION_REFRESH_TIME').asDuration();
const SESSION_REFRESH_SECRET = builder('SESSION_REFRESH_SECRET').asString();

export default
{
    NODE_PORT,
    NODE_ENV,
    NODE_RECOVERY_TIME,
    NODE_COOKIE,

    MAIL_SERVICE,
    MAIL_HOST,
    MAIL_PORT,
    MAIL_USERNAME,
    MAIL_PASSWORD,
    MAIL_FROM,

    DB_WEB_TYPE,
    DB_WEB_HOST,
    DB_WEB_PORT,
    DB_WEB_USERNAME,
    DB_WEB_PASSWORD,
    DB_WEB_DATABASE,
    DB_WEB_SYNC,
    DB_WEB_LOG,

    SOAP_HOST,
    SOAP_PORT,
    SOAP_USERNAME,
    SOAP_PASSWORD,

    SESSION_ACCESS_TIME,
    SESSION_ACCESS_SECRET,

    SESSION_REFRESH_TIME,
    SESSION_REFRESH_SECRET
};
