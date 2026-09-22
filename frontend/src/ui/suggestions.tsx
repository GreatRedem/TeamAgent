// Values an Input offers as the user types. Point the Input's `list` at this `id`.
function Suggestions({
    id,
    options,
}: {
    id: string;
    options: { value: string; label?: string }[];
}) {
    return (
        <datalist id={id} data-slot="suggestions">
            {options.map((option) => (
                <option
                    key={option.value}
                    value={option.value}
                    label={option.label}
                    aria-label={option.label ?? option.value}
                />
            ))}
        </datalist>
    );
}

export { Suggestions };
