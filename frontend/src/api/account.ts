import { request } from './client';

export function walletNonce(address: string)
{
    return request<{ message: string }>('POST', '/account/wallet/nonce', { address });
}

export function walletSignIn(address: string, signature: string)
{
    return request<{ accessToken: string }>('POST', '/account/wallet/sign-in', { address, signature });
}
