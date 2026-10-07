import type { AppEntry } from "../catalog/seed.ts";
export declare function parseArgs(argv: string[]): {
    help: boolean;
    apps: number | undefined;
    json: string | undefined;
};
export declare const USAGE: string;
export declare function probe(app: AppEntry): Promise<{
    id: string;
    name: string;
    url?: string;
    kind: string;
    status: number;
    ms: number;
    wantsAuth: boolean;
    dead: boolean;
    unavailable: boolean;
    challengeScheme: string | undefined;
    bodySample: string | undefined;
}>;
export declare function main(argv: string[]): Promise<void>;