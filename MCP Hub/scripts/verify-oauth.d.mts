import type { AppEntry } from "../catalog/seed.ts";
export declare function parseArgs(argv: string[]): {
    help: boolean;
    strict: boolean;
    apps: number | undefined;
    json: string | undefined;
};
export declare const USAGE: string;
export declare function main(argv: string[]): Promise<void>;