#!/usr/bin/env node
export declare function parseArgs(argv: any): {
    help: any;
    noOpen: any;
    port: number;
};
export declare const USAGE = "Preview the MCP Connect panel.\n\n  --port <n>   port to listen on (default 5183)\n  --no-open    print the URL instead of opening a browser\n  --help       show this text\n";
/**
 * A runtime that answers like the real one, so the panel has something honest to draw.
 *
 * Deliberately mixed: one app waiting for sign-in, two connected with a tool count, one
 * failed, and everything else absent. A stub where everything is connected hides exactly
 * the states that break.
 */
export declare const STUB_RUNTIME_SOURCE = "(() => {\n  const statuses = {\n    higgsfield: { status: \"needs_auth\" },\n    \"google-drive\": { status: \"connected\", tools: [\"search\", \"read\", \"create\"] },\n    github: { status: \"connected\", tools: [\"create_issue\", \"list_prs\", \"get_file\"] },\n    \"duckduckgo\": { status: \"connected\", tools: [\"search\"] },\n    slack: { status: \"failed\", error: \"the server refused the connection\" },\n  }\n  return {\n    statuses: async () => ({ ...statuses }),\n    toolNames: async () => Object.entries(statuses).flatMap(([name, s]) => (s.tools ?? []).map((t) => name + \"__\" + t)),\n    connect: async (name) => { statuses[name] = { status: \"connected\", tools: [\"stub\"] } },\n    addServer: async (name) => { statuses[name] = { status: \"connected\", tools: [\"stub\"] }; return statuses[name] },\n    authenticate: async () => {},\n    disconnect: async (name) => { delete statuses[name] },\n  }\n})()";
/**
 * The page that mounts the panel.
 *
 * The stub is inlined as source text because the inline module runs in the browser and
 * cannot import anything from node. The panel is mounted through `jsx` rather than by
 * calling it as a plain function: calling a Solid component directly runs its body outside
 * a reactive owner, so the signals it creates are never disposed and the panel renders once
 * and then stops responding.
 */
export declare function page(): string;
export declare function openBrowser(url: any): void;
export declare function main(argv: any): Promise<void>;
