/**
 * Roughly what a markdown document costs a model, formatted the one way it is
 * shown.
 *
 * Tokenisers differ per provider, but markdown prose runs about four
 * characters to the token across all of them, which is close enough to tell a
 * 200-token file from a 2000-token one. Shipping a real tokeniser -- one per
 * provider, to be honest about it -- would be a lot of weight for a number
 * whose only job is to guide editing, and the `~` is there to say so.
 *
 * Shared so the agent's files and a profile's files are never counted two
 * different ways.
 */
export function tokenLabel(text: string): string
{
    return `~${ Math.ceil(text.length / 4).toLocaleString() } tokens`;
}
