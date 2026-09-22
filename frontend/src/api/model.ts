import { pageQuery, request, type Paged } from './client';

export interface TeamModel
{
    id: number;
    name: string;
    model: string;
    base_url: string;
    key_hint: string;
    context_tokens: number;
    created_at: string;
}

export interface TeamModelProbe
{
    ok: boolean;
    models?: number;
    found?: boolean;
    context?: number;
    ids?: string[];
    reason?: string;
}

export interface CatalogModel
{
    id: string;
    name: string;
    context: number;
    prompt: number;
    completion: number;
}

export interface ProviderPreset
{
    key: string;
    label: string;
    url: string;
    catalog: boolean;
    key_required: boolean;
    models: { id: string; context: number }[];
    hint: string;
}

export function modelProbe(teamId: number, baseUrl: string, apiKey: string, model: string)
{
    return request<TeamModelProbe>('POST', `/team/${ teamId }/model/probe`, { base_url: baseUrl, api_key: apiKey, model });
}

export function modelList(teamId: number, page?: Partial<Paged>)
{
    return request<{ models: TeamModel[] } & Paged>('GET', `/team/${ teamId }/model${ pageQuery(page) }`);
}

export function modelCreate(teamId: number, name: string, model: string, baseUrl: string, apiKey: string, contextTokens: number)
{
    return request<TeamModel>('POST', `/team/${ teamId }/model`, { name, model, base_url: baseUrl, api_key: apiKey, context_tokens: contextTokens });
}

export function modelUpdate(teamId: number, modelId: number, name: string, model: string, baseUrl: string, apiKey: string, contextTokens: number)
{
    return request<TeamModel>('PATCH', `/team/${ teamId }/model/${ modelId }`, { name, model, base_url: baseUrl, api_key: apiKey, context_tokens: contextTokens });
}

export function modelRemove(teamId: number, modelId: number)
{
    return request<{ result: string }>('DELETE', `/team/${ teamId }/model/${ modelId }`);
}

export function modelTest(teamId: number, modelId: number)
{
    return request<TeamModelProbe>('POST', `/team/${ teamId }/model/${ modelId }/test`);
}

export function modelCatalog()
{
    return request<{ base_url: string; providers: ProviderPreset[]; models: CatalogModel[]; reason?: string }>('GET', '/model/catalog');
}
