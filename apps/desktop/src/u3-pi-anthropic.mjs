/**
 * BYOK providers have their own names, so Pi cannot identify their Claude models by provider.
 * Reuse the SDK's matching Anthropic model capabilities, including its thinking binding recovery.
 * Keep the person's endpoint, key reference, context length and effort configuration.
 */

/**
 * @param {import('@earendil-works/pi-coding-agent').ModelRuntime} runtime
 * @param {ReturnType<typeof import('./pi-config.mjs').modelsJson>} config
 */
export function configureAnthropicProviders(runtime, config) {
  for (const [provider, service] of Object.entries(config.providers)) {
    if (service.api !== 'anthropic-messages') continue;
    let matched = false;
    const models = service.models.map((model) => {
      const native = runtime.getModel('anthropic', model.id);
      if (!native?.compat) return model;
      matched = true;
      return { ...model, compat: { ...native.compat, ...model.compat } };
    });
    if (matched) runtime.registerProvider(provider, { ...service, models });
  }
}
