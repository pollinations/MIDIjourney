import { useEffect, useState } from "react";

const compactQuery = "(max-height: 519px)";

export function useCompactLayout() {
	const [compact, setCompact] = useState(
		() => window.matchMedia(compactQuery).matches,
	);
	useEffect(() => {
		const query = window.matchMedia(compactQuery);
		const update = () => setCompact(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);
	return compact;
}
