export declare function parseArgs(argv: string[]): {
    help: boolean;
    config: boolean;
};
export declare const USAGE: string;
export declare function main(argv: string[]): Promise<void>;