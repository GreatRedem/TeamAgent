import { STATUS_BAD_REQUEST, STATUS_UNAUTHORIZED } from './status.js';

export class BadRequestResponse {
    constructor(result: string) {
        return { statusCode: STATUS_BAD_REQUEST, result };
    }
}

export class UnauthorizedResponse {
    constructor(result: string) {
        return { statusCode: STATUS_UNAUTHORIZED, result };
    }
}
