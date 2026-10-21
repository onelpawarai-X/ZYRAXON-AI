import type { AppEntry } from "../catalog/seed";
import { type McpRuntime } from "../lib/connect";
import type { Resolution } from "../lib/resolve";
import { supportsZeroSetup } from "../lib/registry";
export interface McpHubPanelProps {
    runtime: McpRuntime;
    /** resolve an app to a real server when the catalog has no endpoint for it */
    resolve: (app: AppEntry) => Promise<Resolution>;
    /** close the panel */
    onClose?: () => void;
}
declare const authLabel: Record<string, string>;
export declare function McpHubPanel(props: McpHubPanelProps): import("solid-js").JSX.Element;
export { authLabel, supportsZeroSetup };
