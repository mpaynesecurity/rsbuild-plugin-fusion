import { type ComponentType } from "preact"
import { useEffect, useState } from "preact/hooks"

interface FusionProps {
	action: () => any
	fallback?: string
	
	[key: string]: any
}

// A reusable, zero-boilerplate component wrapper for the React/Preact ecosystems
export const Fusion: ComponentType<FusionProps> = ({action, fallback = "...loading", ...props}) => {
	const [data, setData] = useState(fallback)
	
	useEffect(() => {
		const res = action()
		if(res && typeof res.then === "function") {
			res.then((text: any) => setData(text || ""))
		}
		else {
			setData(res || "")
		}
	}, [action])
	
	return <span {...props}>{data}</span>
}
