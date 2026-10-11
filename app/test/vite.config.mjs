import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
export default {
	root,
	base: "./",
	plugins: [react(), tailwindcss()],
	resolve: {
		dedupe: ["react", "react-dom", "@pollinations/sdk"],
		alias: [
			{
				find: /^@pollinations\/sdk$/,
				replacement: resolve(
					dirname(require.resolve("@pollinations/sdk/package.json")),
					"dist/index.js",
				),
			},
		],
	},
	define: { __MIDIJOURNEY_APP_KEY__: JSON.stringify("pk_fixture_application") },
	server: {
		host: "127.0.0.1",
		port: 5186,
		strictPort: true,
		fs: {
			allow: [
				root,
				resolve(root, "../node_modules/@pollinations/ui/dist"),
				resolve(root, "../core/test/fixtures/managed-agent-replies.json"),
			],
		},
	},
};
