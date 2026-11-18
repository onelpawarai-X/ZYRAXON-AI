// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { Hooks, PluginInput } from "@zyraxon-ai/plugin"

/**
 * ZYRAXON is an API-key provider, exactly like Azure or Cloudflare: the key is
 * what authorises every request, and there is no anonymous path.
 *
 * Registering the method here is what makes the provider offer the same "enter
 * your API key" step as every other provider. Without it the provider had no
 * auth method at all, so the app had nothing to offer for it and fell back to
 * presenting its models as free.
 */
export async function ZyraxonAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "zyraxon",
      methods: [
        {
          type: "api",
          label: "API key",
        },
      ],
    },
  }
}
