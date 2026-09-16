/**
 * Minimal output plumbing for linear workflows: step configs may reference
 * prior step outputs and the run input as `${steps.<key>.<path>}` or
 * `${input.<path>}` inside strings. Pure and total except for unknown
 * references, which throw so a typo fails the step loudly instead of
 * silently injecting an empty string into a tool call.
 */

export interface TemplateContext {
  steps: Record<string, unknown>;
  input: unknown;
}

export class TemplateReferenceError extends Error {
  readonly reference: string;

  constructor(reference: string) {
    super(`Unknown template reference: ${reference}`);
    this.name = "TemplateReferenceError";
    this.reference = reference;
  }
}

const PLACEHOLDER = /\$\{(steps(?:\.[A-Za-z0-9_]+)+|input(?:\.[A-Za-z0-9_]+)*)\}/g;

function lookupPath(context: TemplateContext, path: string): unknown {
  const parts = path.split(".");
  const head = parts.shift();
  let current: unknown;
  if (head === "input") {
    current = context.input;
  } else if (head === "steps") {
    current = context.steps;
  } else {
    return undefined;
  }
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Every `steps.<key>` reference in the value, for publish-time checking. */
export function collectStepReferences(value: unknown): string[] {
  const refs = new Set<string>();
  const visit = (node: unknown): void => {
    if (typeof node === "string") {
      for (const match of node.matchAll(PLACEHOLDER)) {
        const path = match[1] ?? "";
        if (path.startsWith("steps.")) {
          const key = path.split(".")[1];
          if (key !== undefined) refs.add(key);
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node === "object" && node !== null) {
      for (const item of Object.values(node)) visit(item);
    }
  };
  visit(value);
  return [...refs];
}

export function renderTemplate(value: unknown, context: TemplateContext): unknown {
  if (typeof value === "string") {
    // A lone placeholder preserves the referenced type; embedded ones
    // stringify (objects via JSON) so surrounding text stays text.
    const lone = /^\$\{(steps(?:\.[A-Za-z0-9_]+)+|input(?:\.[A-Za-z0-9_]+)*)\}$/.exec(value);
    if (lone !== null) {
      const resolved = lookupPath(context, lone[1] ?? "");
      if (resolved === undefined) throw new TemplateReferenceError(lone[1] ?? value);
      return resolved;
    }
    return value.replace(PLACEHOLDER, (_match, path: string) => {
      const resolved = lookupPath(context, path);
      if (resolved === undefined) throw new TemplateReferenceError(path);
      return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
    });
  }
  if (Array.isArray(value)) return value.map((item) => renderTemplate(item, context));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderTemplate(item, context)]),
    );
  }
  return value;
}
