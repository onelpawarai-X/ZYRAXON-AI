#!/usr/bin/env node
export declare function parseArgs(argv: any): {
    help: any;
    apps: number | undefined;
    json: any;
};
export declare const USAGE = "Check every remote endpoint in the catalog.\n\n  --apps <n>     only the first n apps\n  --json <path>  write the full result set to a file\n  --help         show this text\n";
export declare function probe(app: any): Promise<{
    id: any;
    name: any;
    url: any;
    kind: any;
    status: number;
    ms: number;
    wantsAuth: boolean;
    dead: boolean;
    unavailable: boolean;
    challengeScheme: string | undefined;
    bodySample: string | undefined;
    timedOut?: undefined;
    dns?: undefined;
    reason?: undefined;
} | {
    wantsAuth?: undefined;
    dead?: undefined;
    unavailable?: undefined;
    challengeScheme?: undefined;
    bodySample?: undefined;
    id: any;
    name: any;
    url: any;
    kind: any;
    status: number;
    ms: number;
    timedOut: boolean;
    dns: string | undefined;
    reason: string;
}>;
export declare function main(argv: any): Promise<void>;
