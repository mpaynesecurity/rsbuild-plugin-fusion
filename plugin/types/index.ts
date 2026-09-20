import { FormalParameter, TSType, TSTypeAnnotation } from "oxc-parser"
import { parseAndWalk } from "oxc-walker"

export const clientAssets: Record<
	string,
	| {content: string; isGzip: true}
	| {bytes: number[]; isGzip: false}
> = {}

/**
 * Module-scoped map registry tracks live actions during development
 *
 * @type {Map<string, Function>}
 */
export const localRpcFunctions: Map<string, Function> = new Map<string, Function>()

/**
 * Registry map which holds the compiled production rpc function calls
 *
 * @type {Map<string, string>}
 */
export const productionRpcManifest: Map<string, string> = new Map<string, string>()

/**
 * Modifies the standard JavaScript/TypeScript Request object and ensures that calling .formData() always
 * returns a valid FormData object wrapped in a Promise, eliminating the default TypeScript possibility that
 * it might return unknown or cause type errors.
 */
export type SafeRequest = Omit<Request, "formData"> & {
	formData(): Promise<FormData>
}


/**
 * @type {(err?: any) => void}
 */
export type NextFunction = (err?: any) => void

/**
 * Function wrapper (like a higher-order function or decorator) that takes a standard function and forces it to always return a Promise, ensuring it can be safely awaited on the server.
 *
 * `<Args extends any[], Return>`: Sets up two dynamic placeholders (generics).
 *
 * `Args`: Represents whatever arguments the original function takes, stored as an array.
 * `Return`: Represents whatever the original function output
 *
 * `Promise<Awaited<Return>>`: This is the "magic part". No matter what the original function returned,
 * this new function is guaranteed to return a Promise. The `Awaited<...>` utility unwraps any
 * existing promises so you don't accidentally end up with a nested `Promise<Promise<Value>>`
 */
export type ServerAction = <Args extends any[], Return>(
	fn: (...args: Args) => Return | Promise<Return>,
) => (...args: Args) => Promise<Awaited<Return>>

/**
 * Options passed to the loader
 */
export interface RpcLoaderOptions {
	/**
	 * Are we building for production?
	 */
	isBuild: boolean
	/**
	 * @summary
	 * Registry map which holds the compiled production rpc function calls
	 *
	 * @example
	 * ```ts
	 * productionRpcManifest.set("abc123", srvAction.mjs)
	 * ```
	 */
	productionRpcManifest: Map<string, string>
	/**
	 * @summary
	 * Module-scoped map registry tracks live actions during development
	 *
	 * @example
	 * ```ts
	 * localRpcFunctions.set("abc123", srvAction.mjs)
	 * ```
	 */
	localRpcFunctions: Map<string, Function>
}

/**
 * #### TS Gymnastics Part 1: The Parameter Box
 *
 * @summary
 * Represents a union of completely different structures, they only share two baseline properties that we
 * can safely read before the type can be narrowed:
 *
 * #### .type(string):
 * The literal discriminator string (e.g., `CallExpression`, `Identifier`). This is the key to unlocking the rest of the node's fields.
 *
 * #### .span(object)
 * An object containing start and end byte offsets ({ start: number, end: number }).
 * This tells us exactly where that specific piece of code lives in the raw file string.
 */
export type OxcNode = Parameters<NonNullable<NonNullable<Parameters<typeof parseAndWalk>[2]>["enter"]>>[0]

/**
 * #### TS Gymnastics Part 2: The massive union
 *
 * @summary
 * When we iterate through firstArg.params, we are looking at the parameter definitions of the function.
 * The problem is, parameters aren't just a string name because JavaScript allows things like
 * `function({ id })` (destructuring) or `function(public id: string)` (TypeScript constructors).
 * This custom type acts as a grammatical anchor tag in the code. It literally tells the compiler,
 * "Everything following `:` until a comma or closing parenthesis is a type definition."
 */
export type OxcParam = NonNullable<Extract<OxcNode, {params?: unknown}>["params"]>[number]

