/**
 * The setup guide for every app, in every language the panel offers.
 *
 * The guide is the document. It is written so that somebody who never opens the
 * vendor's documentation can still connect: what kind of sign-in this app wants,
 * where the credential comes from, what to paste, what the browser will ask for,
 * and what to do when it refuses. The vendor's own link is offered alongside it
 * for the apps that publish one, but nothing in here depends on following it.
 *
 * Every language except English is machine-translated at build time by
 * scripts/build-guide-text.ts and frozen into guide-text.ts. Nothing is
 * translated at runtime, so the guide reads the same offline as online, and a
 * language switch is instant. English lives here as the source text; if a
 * translation is ever missing, the English line is shown rather than a hole.
 */
import { type AppEntry } from "./seed";
/** The redirect URL every OAuth client in this catalog must be registered with. */
export declare const REDIRECT = "http://127.0.0.1:19876/oauth/callback";
export interface Language {
    /** BCP-47 code, also the key into the translation tables */
    code: string;
    /** the language's own name for itself, which is what a speaker looks for */
    native: string;
    /** English name, for somebody who cannot read the native one */
    english: string;
}
/**
 * The languages on offer.
 *
 * Chosen to cover the scripts and regions people actually use rather than a
 * token handful: every official UN language, the languages of South and
 * Southeast Asia, the major European ones, and a spread across Africa.
 */
export declare const LANGUAGES: Language[];
/**
 * The English source text. Every line a translation is keyed against lives here.
 *
 * The {braces} are filled in per app by the composer below, so one sentence
 * serves all 108 apps and a correction to the wording lands everywhere at once.
 */
export declare const templates: {
    readonly title: "Setup guide";
    readonly language: "Language";
    readonly docs: "Documentation";
    readonly endpoint: "Endpoint";
    readonly endpointLocal: "runs on this machine";
    readonly howto: "How to connect";
    readonly scopes: "Scopes requested";
    readonly oauthClient: "OAuth client ID";
    readonly goodToKnow: "Good to know";
    readonly close: "Close";
    readonly cancel: "Cancel";
    readonly openConsole: "Open console";
    readonly generateLink: "Generate sign-in link";
    readonly generating: "Generating…";
    readonly pasteClientId: "Paste client ID";
    readonly pasteSecret: "Client secret (only if the console showed one)";
    readonly oauthHelp: "This vendor only accepts clients it issued itself. Create one at {console}, using exactly {redirect} as the redirect URL, then paste it here.";
    readonly hasDocs: "Official documentation is linked below. The steps here work on their own — use the link only if you want the vendor's full reference.";
    readonly noDocs: "This app publishes no documentation link of its own, so everything you need is written right here.";
    readonly seeSteps: "The exact buttons to press are in the numbered list below.";
    readonly none1: "{name} needs no sign-in, no key, and no account. The server answers anyone who asks.";
    readonly none2: "Press Connect. The handshake happens in the background and the app's tools become available to the agent straight away.";
    readonly none3: "Nothing to fill in. Disconnect removes it again; Connect brings it back.";
    readonly noneTrouble: "If the first connection fails, press Disconnect and then Connect once more — this endpoint answers without any credential, so nothing else is missing.";
    readonly local1: "{name} runs on your own machine — no account, no key, no token.";
    readonly local2: "Press Connect and ZYRAXON starts it for you. It listens only on this computer.";
    readonly local3: "It is started with: {command}";
    readonly localTrouble: "If it does not come up, something else is already using its port — close that program and press Connect again.";
    readonly token1: "You need one access key. That is the only thing standing between you and this server.";
    readonly tokenUrl: "Make a key here: {tokenUrl} — sign in, create one, and copy it.";
    readonly tokenConsole: "Make a key in the vendor's own dashboard: {consoleUrl}.";
    readonly tokenFind: "Sign in to the vendor's dashboard and look for an API key — it is usually under Account → API keys.";
    readonly token2: "Paste the key into the box on this card and press Connect.";
    readonly token3: "The server is asked straight away whether the key is good, so a wrong or expired key is reported at once and you can fix it in the same place.";
    readonly token4: "The key stays on this machine and is sent only to {name}.";
    readonly tokenTrouble: "Refused anyway? Make a fresh key — keys expire, and changing a password often revokes the old one.";
    readonly oc1: "One click and you are signed in — there is nothing to type.";
    readonly oc2: "Press Connect. The sign-in page opens in your browser; sign in if it asks, press Allow, and this card turns connected.";
    readonly oc3: "The first time, the vendor asks whether ZYRAXON may talk to your account. Allow it and you are done — next time it remembers you.";
    readonly ocTrouble: "Turned away at the sign-in page? The server and ZYRAXON must agree on the redirect address {redirect}; the vendor's MCP documentation states the one it expects.";
    readonly ci1: "{name} only accepts client IDs it issued itself, so there is a one-time setup.";
    readonly ci2: "Open {console} and create an application. Use exactly {redirect} as the redirect URL.";
    readonly ci3: "Ask for these permissions while creating it: {scope}";
    readonly ci4: "Copy the Client ID — and the client secret, if the console shows one — into the boxes on this card, then press Connect.";
    readonly ci5: "The browser opens the sign-in page; press Allow and the card turns connected. From then on, reconnecting is a single click.";
    readonly ciTrouble: "Refused after signing in? The saved redirect URL is the usual cause: it must be exactly {redirect}.";
    readonly howNone: "Nothing to do. Press Connect and the tools are usable straight away.";
    readonly howLocal: "It ships with ZYRAXON and starts on its own. Press Connect to wake it.";
    readonly howToken: "Paste your access key into the box and press Connect. The server checks it immediately.";
    readonly howOAuth: "Press Connect. A sign-in page opens in your browser; approve it there and this card turns connected.";
    readonly done: "A connected card stays green until you press Disconnect.";
};
export type TemplateKey = keyof typeof templates;
/**
 * Pick the language the guide should open in.
 *
 * The panel's own language is English, so English is only the answer when the
 * browser offers nothing better — a Bengali browser gets Bengali, a Japanese
 * one gets Japanese, and anything unmatched falls back to English rather than
 * to a language the reader cannot read.
 */
export declare function detectLanguage(): string;
/** One translated sentence, with the app's own details put in place. */
export declare function line(lang: string, key: TemplateKey, fills?: Record<string, string>): string;
/**
 * A piece of the catalog written by hand — a vendor's step, or a note about one
 * — rendered in the reader's language.
 *
 * These are keyed by their English text rather than by position, so adding an
 * app to the catalog cannot shift a translation onto the wrong app. Anything
 * that has never been translated comes back in English, which is always better
 * than a blank.
 */
export declare function catalogText(text: string, lang: string): string;
/** The documentation link this server publishes, if it publishes one. */
export declare function docsFor(app: AppEntry): string | undefined;
/**
 * The guide itself: what this app is, where its credential comes from, what to
 * do with it, and what to try when it says no.
 *
 * Written per kind because that is what actually differs — 26 apps need nothing
 * at all, 12 want a pasted key, 65 sign in through the browser of which 16 need
 * a client ID first, and 5 run on this machine. The reader gets their own
 * situation, not a paragraph that hedges between all of them.
 */
export declare function guideFor(app: AppEntry, lang?: string): string[];
