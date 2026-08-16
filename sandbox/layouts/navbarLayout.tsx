import { Navbar } from "@/components"
import { navRoutes } from "@/types"
import type { ParentProps } from "solid-js"

export const NavbarLayout = (props: ParentProps) => {
	return (
		<>
			<Navbar routes={navRoutes} />
			{props.children}
		</>
	)
}