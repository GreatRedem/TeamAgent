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





    return { asNumber, asString };
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
