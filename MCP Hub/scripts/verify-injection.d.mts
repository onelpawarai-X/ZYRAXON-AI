#!/usr/bin/env node
export declare function parseArgs(argv: any): {
    help: any;
    config: any;
};
export declare const USAGE = "Check that the Hub is wired into the host app.\n\n  --config   also check that the plugin is registered in ~/.config/zyraxon/zyraxon.jsonc\n  --help     show this text\n";
export declare function main(argv: any): Promise<void>;
