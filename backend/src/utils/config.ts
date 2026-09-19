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

const NODE_DB = builder('NODE_DB').asString();
const NODE_COOKIE = builder('NODE_COOKIE').asString();

const SESSION_ACCESS_SECRET = builder('SESSION_ACCESS_SECRET').asString();
const SESSION_REFRESH_SECRET = builder('SESSION_REFRESH_SECRET').asString();

export default
{
    NODE_PORT,
    NODE_ENV,
    NODE_DB,
    NODE_COOKIE,

    SESSION_ACCESS_SECRET,
    SESSION_REFRESH_SECRET
};
