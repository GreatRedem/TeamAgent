import { request } from './client';

export function walletNonce(address: string) {
    return request<{ message: string }>('POST', '/account/wallet/nonce', { address });
}

export function walletSignIn(address: string, signature: string) {
    return request<{ accessToken: string }>('POST', '/account/wallet/sign-in', {
        address,
        signature,
    });
}

export type PlanKey = 'free' | 'pro' | 'business' | 'custom';

export interface PlanLimits {
    projects: number;
    agents: number;
    bots: number;
    tasks: number;
}

export interface Plan {
    key: PlanKey;
    price: number | null;
    limits: PlanLimits | null;
}

export interface AccountMe {
    id: number;
    admin: boolean;
    wallet: string | null;
    plan: PlanKey;
    chosen_plan: PlanKey;
    plan_until: string | null;
    limits: PlanLimits | null;
    projects: number;
}

export function accountMe() {
    return request<AccountMe>('GET', '/account/me');
}

export function accountPlans() {
    return request<{ plans: Plan[] }>('GET', '/account/plans');
}
