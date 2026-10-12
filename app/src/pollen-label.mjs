const compactNumber = new Intl.NumberFormat("en", {
	notation: "compact",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

export function pollenLabel(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return "—";
	if (value <= 0) return "0.00";
	if (value < 0.01) return "<0.01";
	return compactNumber.format(value);
}
