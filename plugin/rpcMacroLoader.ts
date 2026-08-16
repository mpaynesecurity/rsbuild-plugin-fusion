import type { Rspack } from "@rsbuild/core"
import MagicString from "magic-string"
import { parseAndWalk } from "oxc-walker"
import { runtime } from "std-env"
import { parseSync } from "oxc-parser"

export interface RpcLoaderOptions {
	isBuild: boolean
	productionRpcManifest: Map<string, string>
	localRpcFunctions: Map<string, Function>
}

export default function rpcMacroLoader(this: Rspack.LoaderContext<RpcLoaderOptions>, code: string): string | void {
	const id = this.resourcePath
	const options = this.getOptions()
	
	const {
		isBuild,
		productionRpcManifest,
		localRpcFunctions,
	} = options
	
	if(!/\.(tsx|jsx|svelte|vue)$/.test(id) || id.startsWith("\0") || !code.includes("useServerAction$")) {
		return code
	}
	
	const fileHash = runtime === "node"
	                 ? Buffer.from(id.replace(/\\/g, "/")).toString("base64").replace(/=/g, "").substring(0, 8)
	                 : Bun.hash(id.replace(/\\/g, "/")).toString().substring(0, 8)
	
	const s = new MagicString(code)
	let idx = 0
	
	parseAndWalk(code, id, {
		parseSync,
		enter(node) {
			if(node.type === "CallExpression") {
				if(node.callee.type === "Identifier" && node.callee.name === "useServerAction$") {
					const rpcId = `${fileHash}_fn_${idx++}`
					
					// Double-check: node.arguments is an array in ESTree format
					const firstArg = node.arguments?.[0]
					if(!firstArg) {
						return
					}
					
					const extFn = code.slice(firstArg.start, firstArg.end)
					
					s.overwrite(
						node.start,
						node.end,
						`(...args) => {
              const fd = new FormData()
              args.forEach((arg, i) => {
                if (arg instanceof File || arg instanceof Blob) {
                  fd.append('arg_' + i, arg)
                } else {
                  fd.append('arg_' + i, JSON.stringify(arg))
                }
              })
              return fetch('/api/rpc?id=${rpcId}', { method: 'POST', body: fd })
                .then(r => r.json())
                .then(d => d.result)
            }`,
					)
					
					if(isBuild) {
						productionRpcManifest.set(rpcId, extFn)
					}
					else {
						localRpcFunctions.set(rpcId, new Function(`return (${extFn})`)())
					}
				}
			}
		},
	})
	
	const map = s.generateMap({hires: true})
	
	this.callback(null, s.toString(), {
		version: map.version,
		mappings: map.mappings,
		names: map.names,
		file: map.file ?? "",
		sources: map.sources.map(src => src ?? ""),
		sourcesContent: map.sourcesContent
		                ? map.sourcesContent.map(content => content ?? "")
		                : undefined,
	})
	return
}
