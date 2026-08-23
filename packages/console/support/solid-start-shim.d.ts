declare module "@solidjs/start/config" {
  import type { PluginOption } from "vite"

  interface SolidStartPluginOptions {
    middleware?: string
    ssr?: boolean
    solid?: Record<string, unknown>
    extensions?: string[]
    publicDir?: string
  }

  export function solidStart(options?: SolidStartPluginOptions): PluginOption
}
