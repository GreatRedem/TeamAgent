import { config } from "../../config.js";
import { OpenAIChatProvider, UnconfiguredProvider, type ModelProvider } from "./gateway.js";

/**
 * The one place the model gateway is chosen from configuration, shared by
 * the API process and the worker process. Both sides of a queue boundary
 * must agree on which provider is live, or a run started by one fails in
 * the other with a provider error that looks like a bug rather than a
 * deployment mistake.
 */
export function modelProviderFromConfig(): ModelProvider {
  return config.MODEL_BASE_URL !== undefined &&
    config.MODEL_BASE_URL !== "" &&
    config.MODEL_API_KEY !== undefined &&
    config.MODEL_API_KEY !== ""
    ? new OpenAIChatProvider({
        baseUrl: config.MODEL_BASE_URL,
        apiKey: config.MODEL_API_KEY,
        timeoutMs: config.MODEL_TIMEOUT_MS,
      })
    : // Fail closed: without credentials the gateway fails runs loudly at
      // invocation time; deployments that never start runs are unaffected.
      new UnconfiguredProvider();
}
