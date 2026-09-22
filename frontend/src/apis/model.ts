import { type Paged, pageQuery, request } from './client';

export interface TeamModel {
    id: number;
    name: string;
    model: string;
    base_url: string;
    key_hint: string;
    context_tokens: number;
    created_at: string;
}

export interface TeamModelProbe {
    ok: boolean;
    models?: number;
    found?: boolean;
    context?: number;
    ids?: string[];
    reason?: string;
}

export interface CatalogModel {
    id: string;
    name: string;
    context: number;
    prompt: number;
    completion: number;
    tools: boolean;
}

export interface ProviderPreset {
    key: string;
    label: string;
    url: string;
    catalog: boolean;
    key_required: boolean;
    models: { id: string; context: number }[];
    hint: string;
}

// `modelId` lets an edit form with a blank key test with the stored one, as with listing.
export function modelProbe(
    teamId: number,
    baseUrl: string,
    apiKey: string,
    model: string,
    modelId?: number,
) {
    return request<TeamModelProbe>('POST', `/team/${teamId}/model/probe`, {
        base_url: baseUrl,
        api_key: apiKey,
        model,
        ...(modelId !== undefined && { model_id: modelId }),
    });
}

// Whether an endpoint is OpenRouter, whose catalog lists every model with its price.
export function isOpenRouterUrl(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();

        return host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
    } catch {
        return false;
    }
}

// The model ids an endpoint offers, for the form. Editing with the key left blank passes
// `modelId`, and the server lists with the stored key if the address is still its own.
export function modelListIds(teamId: number, baseUrl: string, apiKey: string, modelId?: number) {
    return request<{ ok: boolean; ids: string[]; reason?: string }>(
        'POST',
        `/team/${teamId}/model/list`,
        { base_url: baseUrl, api_key: apiKey, ...(modelId !== undefined && { model_id: modelId }) },
    );
}

export function modelList(teamId: number, page?: Partial<Paged>) {
    return request<{ models: TeamModel[] } & Paged>(
        'GET',
        `/team/${teamId}/model${pageQuery(page)}`,
    );
}

export function modelCreate(
    teamId: number,
    name: string,
    model: string,
    baseUrl: string,
    apiKey: string,
    contextTokens: number,
) {
    return request<TeamModel>('POST', `/team/${teamId}/model`, {
        name,
        model,
        base_url: baseUrl,
        api_key: apiKey,
        context_tokens: contextTokens,
    });
}

export function modelUpdate(
    teamId: number,
    modelId: number,
    name: string,
    model: string,
    baseUrl: string,
    apiKey: string,
    contextTokens: number,
) {
    return request<TeamModel>('PATCH', `/team/${teamId}/model/${modelId}`, {
        name,
        model,
        base_url: baseUrl,
        api_key: apiKey,
        context_tokens: contextTokens,
    });
}

export function modelRemove(teamId: number, modelId: number) {
    return request<{ result: string }>('DELETE', `/team/${teamId}/model/${modelId}`);
}

export function modelTest(teamId: number, modelId: number) {
    return request<TeamModelProbe>('POST', `/team/${teamId}/model/${modelId}/test`);
}

export function modelCatalog() {
    return request<{
        base_url: string;
        providers: ProviderPreset[];
        models: CatalogModel[];
        reason?: string;
    }>('GET', '/model/catalog');
}
