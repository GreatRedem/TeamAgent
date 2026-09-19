import { createHash } from 'node:crypto';

export const createSHA256 = (value: Buffer) =>
{
    return createHash('sha256').update(value).digest('hex');
};
