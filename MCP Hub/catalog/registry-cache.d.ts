export interface RegistrySummary {
    /** ISO timestamp of the fetch that produced this number */
    fetched?: string;
    /** how many servers the official registry published at that moment */
    count?: number;
}
/** The summary, or undefined if it is missing or not the shape we expect. */
export declare function registrySummary(): RegistrySummary | undefined;
/** How many servers were cached, or undefined when there is nothing to count. */
export declare function registryCount(): number | undefined;
/** When that count was taken, so the UI can say it is not from today. */
export declare function registryFetched(): string | undefined;
