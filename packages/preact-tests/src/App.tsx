import "./App.css"

import { useEffect, useState } from "preact/hooks"
import { getBunVersion } from "./fn01"
import { Fusion } from "./wrapper.tsx"

const App = () => {
	return (
		<div className="content">
			<h1>Rsbuild with React</h1>
			{/* Zero hooks, zero state, zero boilerplate inside the app code! */}
			<p id="version">
				<Fusion action={getBunVersion} fallback="Loading version..." />
			</p>
		</div>
	)
}

export default App