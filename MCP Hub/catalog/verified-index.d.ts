import type { ConnectKind, InstallKind, VerificationLevel } from "./verified-types";
export type VerifiedRow = [
    string,
    string,
    string,
    InstallKind,
    ConnectKind,
    VerificationLevel,
    number,
    0 | 1,
    string,
    string,
    string,
    string,
    string,
    string
];
export declare const verifiedRowCount = 8094;
export declare const verifiedRows: VerifiedRow[];
