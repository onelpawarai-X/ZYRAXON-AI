import type { AppEntry } from "../catalog/seed";
import type { ConnectionState, McpRuntime } from "../lib/connect";
import type { Resolution } from "../lib/resolve";
import type { RegistryServer } from "../lib/registry";
export interface McpHubPanelProps {
    runtime: McpRuntime;
    /** resolve an app to a real server when the catalog has no endpoint for it */
    resolve: (app: AppEntry) => Promise<Resolution>;
    /** close the panel */
    onClose?: () => void;
}
export declare function McpHubPanel(props: McpHubPanelProps): unknown;
export { authLabel, supportsZeroSetup };