#!/usr/bin/env node
export declare function parseArgs(argv: any): {
    help: any;
    strict: any;
    apps: number | undefined;
    json: any;
};
export declare const USAGE = "Verify OAuth discovery for the whole browser catalog.\n\n  --apps <n>     only the first n apps\n  --strict       fail when an app signs in on a different host\n  --json <path>  write the full result set to a file\n  --help         show this text\n";
export declare function main(argv: any): Promise<void>;
