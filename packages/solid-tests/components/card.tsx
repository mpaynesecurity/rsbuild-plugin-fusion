import { type JSXElement, Show } from "solid-js"

interface CardProps {
	headerContent?: JSXElement | Element
	bodyContent: JSXElement | Element
	footerContent?: JSXElement | Element
}

export const Card = (props: CardProps) => {
	return (
		<div class={ "card" }>
			<Show when={ props.headerContent }>
				{ props.headerContent }
			</Show>
			<div class={ "bg-card-body" }>
				{ props.bodyContent }
			</div>
			<Show when={ props.footerContent }>
				{ props.footerContent }
			</Show>
		</div>
	)
}