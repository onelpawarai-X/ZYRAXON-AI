export declare function parseArgs(argv: string[]): {
    help: boolean;
    terms: string[] | undefined;
    onlyUnresolved: boolean;
};
export declare const USAGE: string;
/** Does this URL answer a real MCP initialize? */
export declare function answers(url: string): Promise<{
    answered: boolean;
    status: number;
    challenged?: boolean;
    error?: string;
}>;
export declare function main(argv: string[]): Promise<void>;