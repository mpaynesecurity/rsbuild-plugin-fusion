import type { ParentProps } from "solid-js"

export const DefaultLayout = (props: ParentProps) => {
	return (
		<>
			{props.children}
		</>
	)
}