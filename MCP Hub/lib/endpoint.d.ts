/**
 * Turn a `{placeholder}` endpoint into a real URL from one answer.
 *
 * Two shapes have to work and they pull in opposite directions. `https://{host}/mcp` already
 * carries the scheme, so the placeholder is a bare host and pasting a full URL there produced
 * `https://https://acme.example.com/mcp`. A template with no scheme at all needs the answer to
 * bring one. So the host is always substituted first and the scheme is added afterwards if the
 * result has none — which satisfies both without having to guess from the placeholder's
 * position.
 *
 * A template with two different variables — `https://{region}.vendor.com/mcp/{account_id}` —
 * cannot be completed from one answer at all, because the second value is not the first one
 * repeated. There the answer is the finished endpoint, which is the only thing a person can
 * actually give; substituting it twice would invent a URL the vendor never sees.
 */
export declare function fillEndpoint(template: string, address: string): string;
/**
 * True when one answer cannot complete the endpoint.
 *
 * A template with two different variables needs two unrelated values, and the dialog collects
 * one. In that case the address the user gives is the finished URL, so the copy asks for that
 * instead of a bare host.
 */
export declare function needsFullUrl(template: string): boolean;
