import type { MarketMagnet } from "@/lib/market-magnets";

type Props = {
  byClass: MarketMagnet["byClass"];
  medianRate: number | null;
  chartMin: number | null;
  chartMax: number | null;
};

function fmtMoney(n: number | null) {
  return n === null ? "—" : `$${n.toLocaleString("en-US")}`;
}

export function ClassRangeChart({ byClass, medianRate, chartMin, chartMax }: Props) {
  const rows = byClass.filter((c) => c.p25 !== null && c.p75 !== null);

  // Bail out rather than render a broken axis or a chart with one lonely bar.
  if (rows.length < 3 || chartMin === null || chartMax === null || chartMax <= chartMin) {
    return null;
  }

  const pct = (v: number | null) =>
    v === null ? 0 : ((v - chartMin) / (chartMax - chartMin)) * 100;

  const medianPct = pct(medianRate);

  return (
    <section className="mb-10">
      <h2 className="text-[1.25rem] font-semibold tracking-tight mb-1">
        Rate ranges by class
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Where the middle 50% of each class is priced
      </p>

      <div className="relative">
        {/* Median line, drawn once behind all rows. Offset to clear the labels. */}
        <div className="absolute left-[132px] right-0 top-0 bottom-0 pointer-events-none">
          <div
            className="absolute top-0 bottom-0 w-px bg-border"
            style={{ left: `${medianPct}%` }}
          />
        </div>

        {rows.map((c) => {
          const left = pct(c.p25);
          const width = Math.max(pct(c.p75) - left, 1.5);
          return (
            <div key={c.class} className="flex items-center h-[34px]">
              <div className="w-[132px] shrink-0 text-[0.8125rem]">
                {c.label}{" "}
                <span className="text-muted-foreground">
                  {c.count.toLocaleString()}
                </span>
              </div>
              <div className="relative flex-1 h-full">
                <div
                  className="absolute top-[11px] h-3 rounded-full bg-primary/25"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
                <div
                  className="absolute top-2 h-[18px] w-0.5 bg-primary"
                  style={{ left: `${pct(c.medianRate)}%` }}
                />
              </div>
            </div>
          );
        })}

        <div className="flex mt-1 text-[0.6875rem] text-muted-foreground">
          <span className="w-[132px] shrink-0" />
          <div className="relative flex-1 h-4">
            <span className="absolute left-0">{fmtMoney(chartMin)}</span>
            <span
              className="absolute whitespace-nowrap -translate-x-1/2"
              style={{ left: `${medianPct}%` }}
            >
              {fmtMoney(medianRate)} market median
            </span>
            <span className="absolute right-0">{fmtMoney(chartMax)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
