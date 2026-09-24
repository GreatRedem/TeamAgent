import type { Permission } from '@/apis';
import { tk } from '@/libs/i18n';

export function capabilityText(key: string, part: 'label' | 'description', english: string) {
    return tk(`catalog.capability.${key}.${part}`, english);
}

export function toolText(name: string, english: string) {
    return tk(`catalog.tool.${name}`, english);
}

export function permissionText(key: string, part: 'label' | 'description', english: string) {
    return tk(`catalog.permission.${key}.${part}`, english);
}

export function kindText(
    key: string,
    part: 'label' | 'description' | 'inbound_hint',
    english: string,
) {
    return english === '' ? '' : tk(`catalog.kind.${key}.${part}`, english);
}

export function fieldText(kind: string, key: string, part: 'label' | 'hint', english: string) {
    return english === '' ? '' : tk(`catalog.kind.${kind}.field.${key}.${part}`, english);
}

export function providerText(key: string, part: 'label' | 'hint', english: string) {
    return english === '' ? '' : tk(`catalog.provider.${key}.${part}`, english);
}

export function actionText(action: string) {
    return tk(`catalog.action.${action}`, action);
}

export function roleText(key: string, part: 'name' | 'description', english: string) {
    return tk(`catalog.role.${key}.${part}`, english);
}

export function localCapabilities(list: Permission[] | null): Permission[] | null {
    return (
        list?.map((item) => ({
            ...item,
            label: capabilityText(item.key, 'label', item.label),
            description: capabilityText(item.key, 'description', item.description),
        })) ?? null
    );
}

export function localPermissions(list: Permission[] | null): Permission[] | null {
    return (
        list?.map((item) => ({
            ...item,
            label: permissionText(item.key, 'label', item.label),
            description: permissionText(item.key, 'description', item.description),
        })) ?? null
    );
}
