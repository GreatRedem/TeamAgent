export function idList(value: string): number[] {
    return value
        .split(',')
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);
}
