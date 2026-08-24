"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  Loader2,
  MapPin,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useProductCta } from "@/components/start-trial-cta";
import {
  calculateRoi,
  formatPct,
  formatUsd,
  type RoiInputs,
} from "@/lib/roi-calculator";
import {
  buildInitialInputs,
  getClassAssumptions,
  ROI_RV_CLASSES,
  type RoiFormInputs,
  type RoiMarketSeed,
  type RoiRvClass,
} from "@/lib/roi-defaults";

type FormState = RoiFormInputs;

function NumberField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  min = 0,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium">
        {label}
      </Label>
      <div className="relative">
        {prefix ? (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`rounded-sm ${prefix ? "pl-7" : ""} ${suffix ? "pr-10" : ""}`}
        />
        {suffix ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-sm bg-muted/30 p-5 sm:p-6 space-y-4">
      <h2 className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function toRoiInputs(form: FormState): RoiInputs {
  return {
    value: form.value,
    cashInvested: form.cashInvested,
    nightsPerYear: form.nightsPerYear,
    nightlyRate: form.nightlyRate,
    avgStayNights: form.avgStayNights,
    platformFeePct: form.platformFeePct,
    insurance: form.insurance,
    storage: form.storage,
    registration: form.registration,
    annualLoanPayments: form.annualLoanPayments,
    cleaningPerTurnover: form.cleaningPerTurnover,
    supplies: form.supplies,
    maintPctOfValue: form.maintPctOfValue,
    includeDepreciation: form.includeDepreciation,
    depreciationPct: form.depreciationPct,
    taxRate: form.taxRate,
    hoursPerWeek: form.hoursPerWeek,
  };
}

export function RoiCalculator({
  initialDefaults = null,
}: {
  initialDefaults?: RoiMarketSeed | null;
}) {
  const cta = useProductCta();
  const seededSlug = initialDefaults?.marketSlug ?? null;
  const [form, setForm] = useState<FormState>(() => {
    const base = buildInitialInputs("Class C");
    if (typeof initialDefaults?.medianRate === "number") {
      return { ...base, nightlyRate: initialDefaults.medianRate };
    }
    return base;
  });
  const [market, setMarket] = useState<RoiMarketSeed | null>(
    initialDefaults ?? null,
  );
  const [rateLocked, setRateLocked] = useState(false);
  const rateLockedRef = useRef(false);
  rateLockedRef.current = rateLocked;
  const skippedSeedFetch = useRef(Boolean(initialDefaults));
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "error" | "ok">(
    initialDefaults ? "ok" : "idle",
  );
  const [lookupError, setLookupError] = useState<string | null>(null);

  const result = useMemo(() => calculateRoi(toRoiInputs(form)), [form]);

  const patch = (partial: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const applyClassDefaults = (rvClass: RoiRvClass) => {
    const c = getClassAssumptions(rvClass);
    setForm((prev) => ({
      ...prev,
      rvClass,
      value: c.value,
      cashInvested: c.value,
      nightsPerYear: c.nightsPerYear,
      avgStayNights: c.avgStayNights,
      insurance: c.insurance,
      storage: c.storage,
      registration: c.registration,
      cleaningPerTurnover: c.cleaningPerTurnover,
      supplies: c.supplies,
    }));
    setRateLocked(false);
  };

  const lookupMarket = useEffectEvent(
    async (opts: { zip?: string; market?: string; rvClass: RoiRvClass }) => {
      const params = new URLSearchParams({ rvClass: opts.rvClass });
      if (opts.zip) params.set("zip", opts.zip);
      else if (opts.market) params.set("market", opts.market);
      else return;

      setLookupStatus("loading");
      setLookupError(null);

      try {
        const res = await fetch(`/api/roi-defaults?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          setLookupStatus("error");
          setLookupError(data.error ?? "Could not look up that ZIP.");
          setMarket(null);
          return;
        }

        startTransition(() => {
          setMarket({
            marketSlug: data.marketSlug,
            marketName: data.marketName,
            distanceMiles: data.distanceMiles ?? 0,
            medianRate: data.medianRate,
            rateSource: data.rateSource,
            listingCount: data.listingCount,
            classCount: data.classCount,
            city: data.city,
            state: data.state,
          });
          if (typeof data.medianRate === "number" && !rateLockedRef.current) {
            setForm((prev) => ({ ...prev, nightlyRate: data.medianRate }));
          }
          setLookupStatus("ok");
        });
      } catch {
        setLookupStatus("error");
        setLookupError("Market lookup failed. You can still enter a nightly rate.");
        setMarket(null);
      }
    },
  );

  useEffect(() => {
    const digits = form.zip.replace(/\D/g, "").slice(0, 5);
    if (digits.length === 5) {
      skippedSeedFetch.current = false;
      const t = setTimeout(() => {
        void lookupMarket({ zip: digits, rvClass: form.rvClass });
      }, 400);
      return () => clearTimeout(t);
    }
    if (seededSlug) {
      if (skippedSeedFetch.current) {
        skippedSeedFetch.current = false;
        return;
      }
      void lookupMarket({ market: seededSlug, rvClass: form.rvClass });
      return;
    }
    setLookupStatus("idle");
    setMarket(null);
  }, [form.zip, form.rvClass, seededSlug]);

  const rateHint = (() => {
    if (!market?.medianRate || !market.rateSource) return null;
    if (market.rateSource === "class") {
      return `Based on median ${form.rvClass} rates in ${market.marketName} (${market.classCount} listings · RVIntel)`;
    }
    return `Based on overall median rates in ${market.marketName} (${market.listingCount} listings · RVIntel)`;
  })();

  const maxExpense = Math.max(
    ...result.expenses.map((e) => e.amount),
    1,
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-8 lg:gap-10 items-start">
      <div className="space-y-4">
        <Section title="Your RV">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium">
                RV type
              </Label>
              <Select
                value={form.rvClass}
                onValueChange={(v) => applyClassDefaults(v as RoiRvClass)}
              >
                <SelectTrigger className="w-full rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROI_RV_CLASSES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NumberField
              id="value"
              label="Purchase / current value"
              prefix="$"
              value={form.value}
              onChange={(value) => {
                setForm((prev) => ({
                  ...prev,
                  value,
                  cashInvested:
                    prev.cashInvested === prev.value ? value : prev.cashInvested,
                }));
              }}
            />
            <NumberField
              id="cash"
              label="Cash invested"
              prefix="$"
              value={form.cashInvested}
              onChange={(cashInvested) => patch({ cashInvested })}
              hint="Down payment or full purchase price if paid cash"
            />
          </div>
        </Section>

        <Section title="Market & demand">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="zip"
                className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium"
              >
                ZIP code
              </Label>
              <div className="relative">
                <Input
                  id="zip"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="92101"
                  value={form.zip}
                  onChange={(e) => patch({ zip: e.target.value })}
                  className="rounded-sm pr-9"
                />
                {lookupStatus === "loading" ? (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                )}
              </div>
              {lookupError ? (
                <p className="text-xs text-destructive">{lookupError}</p>
              ) : market ? (
                <p className="text-xs text-muted-foreground">
                  {market.distanceMiles > 0 ? "Nearest market: " : "Market rates: "}
                  <Link
                    href={`/markets/${market.marketSlug}`}
                    className="text-primary hover:underline"
                  >
                    {market.marketName}
                  </Link>
                  {market.city
                    ? ` · ${market.city}${market.state ? `, ${market.state}` : ""}`
                    : ""}
                  {market.distanceMiles > 0
                    ? ` (${market.distanceMiles} mi)`
                    : ""}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Enter a ZIP to autofill local median rates from RVIntel data
                </p>
              )}
            </div>
            <NumberField
              id="rate"
              label="Nightly rate"
              prefix="$"
              value={form.nightlyRate}
              onChange={(nightlyRate) => {
                setRateLocked(true);
                patch({ nightlyRate });
              }}
              hint={rateHint ?? undefined}
            />
            <NumberField
              id="nights"
              label="Rental nights / year"
              value={form.nightsPerYear}
              onChange={(nightsPerYear) => patch({ nightsPerYear })}
              hint="Assumption — occupancy data coming soon"
            />
            <NumberField
              id="stay"
              label="Avg stay length"
              value={form.avgStayNights}
              onChange={(avgStayNights) => patch({ avgStayNights })}
              suffix="nights"
            />
            <div className="sm:col-span-2 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium">
                  Platform fee
                </Label>
                <span className="text-sm font-medium tabular-nums">
                  {Math.round(form.platformFeePct * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={40}
                step={1}
                value={[Math.round(form.platformFeePct * 100)]}
                onValueChange={([v]) => patch({ platformFeePct: v / 100 })}
              />
              <p className="text-xs text-muted-foreground">
                Default 22% blended (Outdoorsy / RVshare). Set 0% for private bookings.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Operating costs">
          <div className="grid sm:grid-cols-2 gap-4">
            <NumberField
              id="insurance"
              label="Insurance / year"
              prefix="$"
              value={form.insurance}
              onChange={(insurance) => patch({ insurance })}
            />
            <NumberField
              id="storage"
              label="Storage / year"
              prefix="$"
              value={form.storage}
              onChange={(storage) => patch({ storage })}
            />
            <NumberField
              id="registration"
              label="Registration & taxes / year"
              prefix="$"
              value={form.registration}
              onChange={(registration) => patch({ registration })}
            />
            <NumberField
              id="loan"
              label="Loan payments / year"
              prefix="$"
              value={form.annualLoanPayments}
              onChange={(annualLoanPayments) => patch({ annualLoanPayments })}
            />
            <NumberField
              id="cleaning"
              label="Cleaning / turnover"
              prefix="$"
              value={form.cleaningPerTurnover}
              onChange={(cleaningPerTurnover) => patch({ cleaningPerTurnover })}
            />
            <NumberField
              id="supplies"
              label="Supplies / year"
              prefix="$"
              value={form.supplies}
              onChange={(supplies) => patch({ supplies })}
            />
            <div className="sm:col-span-2 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium">
                  Maintenance (% of value / year)
                </Label>
                <span className="text-sm font-medium tabular-nums">
                  {(form.maintPctOfValue * 100).toFixed(1)}%
                </span>
              </div>
              <Slider
                min={0.5}
                max={5}
                step={0.1}
                value={[form.maintPctOfValue * 100]}
                onValueChange={([v]) => patch({ maintPctOfValue: v / 100 })}
              />
            </div>
          </div>
        </Section>

        <Section title="Advanced">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Include depreciation</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Economic ROI only — not a cash expense
                </p>
              </div>
              <Switch
                checked={form.includeDepreciation}
                onCheckedChange={(includeDepreciation) =>
                  patch({ includeDepreciation })
                }
              />
            </div>
            {form.includeDepreciation ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium">
                    Depreciation rate
                  </Label>
                  <span className="text-sm font-medium tabular-nums">
                    {Math.round(form.depreciationPct * 100)}%
                  </span>
                </div>
                <Slider
                  min={5}
                  max={20}
                  step={1}
                  value={[Math.round(form.depreciationPct * 100)]}
                  onValueChange={([v]) => patch({ depreciationPct: v / 100 })}
                />
              </div>
            ) : null}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium">
                  Estimated tax rate
                </Label>
                <span className="text-sm font-medium tabular-nums">
                  {Math.round(form.taxRate * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={45}
                step={1}
                value={[Math.round(form.taxRate * 100)]}
                onValueChange={([v]) => patch({ taxRate: v / 100 })}
              />
              <p className="text-xs text-muted-foreground">
                Rough blended income + self-employment estimate — not tax advice
              </p>
            </div>
            <NumberField
              id="hours"
              label="Hours managing / week"
              value={form.hoursPerWeek}
              onChange={(hoursPerWeek) => patch({ hoursPerWeek })}
              hint="Shows effective hourly return — hosting is rarely fully passive"
            />
          </div>
        </Section>
      </div>

      <div className="lg:sticky lg:top-24 space-y-4">
        <div
          className="rounded-sm p-6 sm:p-8 space-y-6"
          style={{
            background:
              "linear-gradient(160deg, oklch(0.22 0.03 180) 0%, oklch(0.18 0.02 220) 100%)",
            boxShadow: "0 12px 40px rgba(25, 28, 30, 0.06)",
          }}
        >
          <div className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-teal-300/90">
            <TrendingUp className="w-3.5 h-3.5" />
            Estimated annual return
          </div>

          <div>
            <p className="text-5xl font-semibold tracking-tight text-white tabular-nums leading-none">
              {formatPct(result.cashOnCash)}
            </p>
            <p className="text-sm text-white/60 mt-2">Cash-on-cash ROI</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xl font-semibold text-white tabular-nums">
                {formatUsd(result.noi)}
              </p>
              <p className="text-[0.6875rem] uppercase tracking-[0.05em] text-white/50 mt-1">
                Net operating income
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold text-white tabular-nums">
                {result.paybackYears != null
                  ? `${result.paybackYears.toFixed(1)} yrs`
                  : "—"}
              </p>
              <p className="text-[0.6875rem] uppercase tracking-[0.05em] text-white/50 mt-1">
                Payback
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold text-white tabular-nums">
                {formatUsd(result.gross)}
              </p>
              <p className="text-[0.6875rem] uppercase tracking-[0.05em] text-white/50 mt-1">
                Gross revenue
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold text-white tabular-nums">
                {formatUsd(result.afterTaxNoi)}
              </p>
              <p className="text-[0.6875rem] uppercase tracking-[0.05em] text-white/50 mt-1">
                After-tax estimate
              </p>
            </div>
          </div>

          {form.includeDepreciation ? (
            <div className="pt-2 border-t border-white/10">
              <p className="text-sm text-white/80">
                Economic ROI (with depreciation):{" "}
                <span className="font-semibold text-white tabular-nums">
                  {formatPct(result.economicRoi)}
                </span>
              </p>
            </div>
          ) : null}

          {result.dollarsPerHour != null ? (
            <p className="text-sm text-white/70">
              Effective hourly:{" "}
              <span className="font-medium text-white tabular-nums">
                {formatUsd(result.dollarsPerHour)}/hr
              </span>{" "}
              at {form.hoursPerWeek} hrs/week
            </p>
          ) : null}
        </div>

        <div className="rounded-sm bg-muted/30 p-5 sm:p-6 space-y-4">
          <h3 className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-muted-foreground">
            Expense waterfall
          </h3>
          <div className="space-y-3">
            {result.expenses.map((line) => (
              <div key={line.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm gap-3">
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="font-medium tabular-nums shrink-0">
                    {formatUsd(line.amount)}
                  </span>
                </div>
                <div className="h-1 rounded-sm bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-primary/70"
                    style={{ width: `${(line.amount / maxExpense) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm pt-2 border-t border-border/60">
            <span className="font-medium">Total expenses</span>
            <span className="font-semibold tabular-nums">
              {formatUsd(result.totalExpenses)}
            </span>
          </div>
        </div>

        <div
          className="rounded-sm p-6 space-y-4"
          style={{
            background: "linear-gradient(135deg, #006b5f, #2dd4bf)",
          }}
        >
          <div className="flex items-start gap-3">
            <Calculator className="w-5 h-5 text-white/90 shrink-0 mt-0.5" />
            <div>
              <p className="text-lg font-semibold text-white leading-snug">
                {market
                  ? `Want real competitor rates in ${market.marketName}?`
                  : "Want real competitor rates in your market?"}
              </p>
              <p className="text-sm text-white/80 mt-1.5 leading-relaxed">
                RVIntel tracks live Outdoorsy & RVshare listings so you can price
                with data—not guesses.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <Button
              asChild
              size="lg"
              className="h-12 px-8 font-medium rounded-sm bg-white text-[#006b5f] hover:bg-white/95"
            >
              <Link href={cta.href}>
                {cta.label}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            {market ? (
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-sm border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white h-12"
              >
                <Link href={`/markets/${market.marketSlug}`}>
                  View {market.marketName}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
