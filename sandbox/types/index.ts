import { type RouteDefinition } from "@solidjs/router"
import { lazy } from "solid-js"

/**
 * @interface IRoute
 * @extends RouteDefinition
 */
export interface IRoute extends RouteDefinition {
	path: string
	label: string
	exact: boolean
}

/**
 * @interface INavbarProps
 */
export interface INavbarProps {
	routes: IRoute[]
}

/**
 * @satisfies IRoute[]
 * @see IRoute
 * */
export const navRoutes = [
	{
		path: "/",
		label: "Home",
		exact: true,
		component: lazy(() => import("@/pages/index.tsx")),
	},
	{
		path: "/context",
		label: "Context",
		exact: true,
		component: lazy(() => import("@/pages/context.tsx")),
	},
] satisfies IRoute[]