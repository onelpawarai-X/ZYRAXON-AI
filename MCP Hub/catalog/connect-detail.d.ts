export interface ConnectDetail {
    /** environment variables a local package reads before it will start */
    env?: {
        name: string;
        description?: string;
        secret?: boolean;
        url?: string;
    }[];
    /** a remote endpoint still holding a {placeholder} the user must fill */
    urlTemplate?: string;
    /** for a browser sign-in: whether the server registers its own client, so nothing is asked */
    selfRegisters?: boolean;
    /** the discovery document a browser sign-in was proven against, shown on Details */
    metadataUrl?: string;
    /** the header a pasted key travels in, when it is not the default Bearer */
    authKind?: string;
    /** the page that issues the client ID or key this row asks for */
    consoleUrl?: string;
}
export declare const connectDetails: Record<string, ConnectDetail>;
