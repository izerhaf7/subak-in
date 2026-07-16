// Shared Recharts tooltip styling — the library's default white box with
// rounded corners is a giveaway that nothing was styled; this pulls it onto
// the app's own surface/border/type tokens instead.
export const TOOLTIP_PROPS = {
  contentStyle: {
    background: "#fbfaf7",
    border: "1px solid rgba(0, 0, 0, 0.18)",
    borderRadius: 4,
    fontSize: 12,
    padding: "6px 10px",
  },
  labelStyle: {
    color: "rgba(0, 0, 0, 0.55)",
    fontSize: 11,
    marginBottom: 2,
  },
  itemStyle: {
    fontFamily: 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace',
    fontSize: 12,
    padding: 0,
  },
};
