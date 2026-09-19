import { STATUS_BAD_REQUEST, STATUS_FORBIDDEN, STATUS_INTERNAL_ERROR, STATUS_TOO_MANY_REQUEST, STATUS_UNAUTHORIZED } from './status.js';

export class BadRequestResponse
{
    constructor(result: string)
    {
        return { statusCode: STATUS_BAD_REQUEST, result };
    }
}

export class UnauthorizedResponse
{
    constructor(result: string)
    {
        return { statusCode: STATUS_UNAUTHORIZED, result };
    }
}

export class ForbiddenResponse
{
    constructor(result: string)
    {
        return { statusCode: STATUS_FORBIDDEN, result };
    }
}

export class TooManyRequestResponse
{
    constructor(result: string)
    {
        return { statusCode: STATUS_TOO_MANY_REQUEST, result };
    }
}

export class InternalErrorResponse
{
    constructor()
    {
        return { statusCode: STATUS_INTERNAL_ERROR };
    }
}
