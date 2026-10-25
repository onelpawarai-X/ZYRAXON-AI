#!/usr/bin/env node
/** Classify a server the way the catalog will: remotes win, then package registries. */
export declare function installKindOf(server: any): "docker" | "mcpb" | "npx" | "nuget" | "remote_http" | "unknown" | "uvx";
/**
 * Does this server need a value only the user has?
 *
 * Two shapes mean yes: a declared required environment variable, or a remote whose URL
 * still carries a `{placeholder}` the caller must fill. Everything else can be reached
 * with nothing in hand, which is what the no_auth card promises.
 */
export declare function needsInput(server: any): "api_key" | "url_input" | undefined;
