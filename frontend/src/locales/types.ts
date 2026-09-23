// Another language's messages for an area: exactly the English keys, each with a string, so a
// missing or misspelt key fails the typecheck instead of showing English by surprise.
export type Messages<T> = { [K in keyof T]: string };
