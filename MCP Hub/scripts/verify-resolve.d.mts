#!/usr/bin/env node
export declare function parseArgs(argv: any): {
    help: any;
    terms: any;
    onlyUnresolved: any;
};
export declare const USAGE = "Resolve catalog apps through the official registry.\n\n  --terms <a,b>    search for these words instead of using the catalog\n  --only-unresolved  skip apps that already have a first-party endpoint\n  --help           show this text\n";
/** Does this URL answer a real MCP initialize? */
export declare function answers(url: any): Promise<{
    error?: undefined;
    answered: boolean;
    status: number;
    challenged: boolean;
} | {
    challenged?: undefined;
    answered: boolean;
    status: number;
    error: string;
}>;
export declare function main(argv: any): Promise<void>;
