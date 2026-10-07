export declare function parseArgs(argv: string[]): {
    help: boolean;
    noOpen: boolean;
    port: number;
};
export declare const USAGE: string;
/**
 * A runtime that answers like the real one, so the panel has something honest to draw.
 *
 * Deliberately mixed: one app waiting for sign-in, two connected with a tool count, one
 * failed, and everything else absent. A stub where everything is connected hides exactly
 * the states that break. The shape matches McpRuntime exactly, because a stub whose method
 * names differ fails in a way that looks like a broken connector.
 */
export declare const STUB_RUNTIME_SOURCE: string;
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
export declare function openBrowser(url: string): void;
export declare function main(argv: string[]): Promise<void>;