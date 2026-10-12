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
	plugins: [
		react(),
		tailwindcss(),
		{
			name: "mock-pollinations-authorization",
			configureServer(server) {
				server.middlewares.use((request, response, next) => {
					const url = new URL(request.url, "http://127.0.0.1:5186");
					if (url.pathname !== "/authorize") return next();
					response.setHeader("Content-Type", "text/html");
					response.end(`<!doctype html><title>Test Pollinations authorization</title>
<h1>Pollinations authorization (test)</h1>
<p>Approve this simulated connection to return to Live.</p>
<button id="approve">Authorize test connection</button>
<script>
document.getElementById('approve').onclick = () => {
  const params = new URLSearchParams(location.search);
  const callback = new URL(params.get('redirect_uri'));
  if (callback.origin !== location.origin) throw new Error('Test callback must stay local');
  callback.searchParams.set('code', 'test-only-code');
  callback.searchParams.set('state', params.get('state'));
  location.href = callback.href;
};
</script>`);
				});
			},
		},
	],
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
