import { STATUS_BAD_REQUEST, STATUS_UNAUTHORIZED } from './status.js';

export class BadRequestResponse {
    readonly statusCode = STATUS_BAD_REQUEST;
    readonly result: string;

    constructor(result: string) {
        this.result = result;
    }
}

export class UnauthorizedResponse {
    readonly statusCode = STATUS_UNAUTHORIZED;
    readonly result: string;

    constructor(result: string) {
        this.result = result;
    }
}
