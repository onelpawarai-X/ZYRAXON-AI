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
/**
 * True when one answer cannot complete the endpoint.
 *
 * Delegates to the shared helper so the dialog's copy and the config writer agree on what a
 * multi-variable template means. Two different variables need two unrelated values, and the
 * dialog collects one, so the address the user gives is the finished URL and the copy asks for
 * that instead of a bare host.
 */
export declare function instanceNeedsFullUrl(app: AppEntry): boolean;
/**
 * What a server needs before it will run, and where the user goes to get it.
 *
 * The Details panel is where a person decides whether they can connect an app at all, so it
 * has to name every value the connect will ask for and point at the page that issues it. A
 * server that needs nothing says so outright rather than showing an empty list, because
 * "nothing" is a fact worth stating: it is the difference between a press and a setup.
 *
 * The links are the vendor's own, and they are the ones the catalog records: a token page
 * where the app has one, the developer console otherwise. Nothing is guessed — an app with
 * neither shows the requirement without a link rather than a plausible-looking URL.
 */
export declare function requirementsFor(app: AppEntry): {
    label: string;
    detail?: string;
    href?: string;
}[];
