import AjvDefault, { type ValidateFunction } from "ajv";
import { AppError } from "../../lib/http.js";

// CJS/ESM interop: the constructor rides on .default at runtime.
const AjvCtor = AjvDefault as unknown as new (options?: Record<string, unknown>) => {
  compile(schema: Record<string, unknown>): ValidateFunction;
};
const ajv = new AjvCtor({ allErrors: true, strict: true, validateFormats: true });

/**
 * Tool arguments are validated against the tool's input_schema with the
 * narrowest usable types before execution (docs/17 C7). A model is induced
 * to emit malicious arguments; this is where that stops.
 */
export function validateToolArguments(
  inputSchema: unknown,
  args: unknown,
): { valid: true } | { valid: false; errors: string[] } {
  if (typeof inputSchema !== "object" || inputSchema === null) {
    throw new AppError("INVALID_TOOL_SCHEMA", 500, "The tool has no usable input schema.");
  }
  let validate: ValidateFunction;
  try {
    validate = ajv.compile(inputSchema as Record<string, unknown>);
  } catch {
    throw new AppError("INVALID_TOOL_SCHEMA", 500, "The tool input schema does not compile.");
  }
  if (typeof args !== "object" || args === null) {
    return { valid: false, errors: ["arguments must be an object"] };
  }
  const valid = validate(args) as boolean;
  if (valid) return { valid: true };
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
  );
  return { valid: false, errors };
}
