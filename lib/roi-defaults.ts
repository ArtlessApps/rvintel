/** RV classes supported by the ROI calculator (aligned with listing scrape classes). */
export const ROI_RV_CLASSES = [
  "Travel Trailer",
  "Fifth Wheel",
  "Toy Hauler",
  "Class B",
  "Class C",
  "Class A",
] as const;

export type RoiRvClass = (typeof ROI_RV_CLASSES)[number];

export type ClassAssumptions = {
  /** Suggested purchase / current value ($) */
  value: number;
  /** Expected rental nights per year */
  nightsPerYear: number;
  /** Typical average stay length (nights) */
  avgStayNights: number;
  /** Annual commercial rental insurance ($) */
  insurance: number;
  /** Annual storage ($) */
  storage: number;
  /** Annual registration / property tax ($) */
  registration: number;
  /** Cleaning cost per turnover ($) */
  cleaningPerTurnover: number;
  /** Annual supplies / restock ($) */
  supplies: number;
};

/** Shared defaults applied regardless of class (user can override). */
export const ROI_SHARED_DEFAULTS = {
  platformFeePct: 0.22,
  /** Maintenance as % of RV value per year */
  maintPctOfValue: 0.015,
  /** Depreciation as % of RV value per year */
  depreciationPct: 0.12,
  /** Blended income + self-employment tax estimate */
  taxRate: 0.25,
  includeDepreciation: true,
  cashInvestedPct: 1,
  annualLoanPayments: 0,
  hoursPerWeek: 6,
  nightlyRateFallback: 175,
};

export type RoiFormInputs = {
  rvClass: RoiRvClass;
  value: number;
  cashInvested: number;
  zip: string;
  nightsPerYear: number;
  nightlyRate: number;
  avgStayNights: number;
  platformFeePct: number;
  insurance: number;
  storage: number;
  registration: number;
  annualLoanPayments: number;
  cleaningPerTurnover: number;
  supplies: number;
  maintPctOfValue: number;
  includeDepreciation: boolean;
  depreciationPct: number;
  taxRate: number;
  hoursPerWeek: number;
};

const CLASS_ASSUMPTIONS: Record<RoiRvClass, ClassAssumptions> = {
  "Travel Trailer": {
    value: 35_000,
    nightsPerYear: 60,
    avgStayNights: 4,
    insurance: 1_400,
    storage: 1_200,
    registration: 400,
    cleaningPerTurnover: 85,
    supplies: 400,
  },
  "Fifth Wheel": {
    value: 55_000,
    nightsPerYear: 65,
    avgStayNights: 5,
    insurance: 1_800,
    storage: 1_500,
    registration: 550,
    cleaningPerTurnover: 100,
    supplies: 500,
  },
  "Toy Hauler": {
    value: 50_000,
    nightsPerYear: 55,
    avgStayNights: 4,
    insurance: 1_700,
    storage: 1_400,
    registration: 500,
    cleaningPerTurnover: 110,
    supplies: 550,
  },
  "Class B": {
    value: 90_000,
    nightsPerYear: 75,
    avgStayNights: 4,
    insurance: 2_400,
    storage: 1_800,
    registration: 700,
    cleaningPerTurnover: 90,
    supplies: 600,
  },
  "Class C": {
    value: 80_000,
    nightsPerYear: 80,
    avgStayNights: 5,
    insurance: 2_200,
    storage: 1_600,
    registration: 650,
    cleaningPerTurnover: 100,
    supplies: 650,
  },
  "Class A": {
    value: 140_000,
    nightsPerYear: 70,
    avgStayNights: 5,
    insurance: 3_200,
    storage: 2_400,
    registration: 900,
    cleaningPerTurnover: 150,
    supplies: 800,
  },
};

export function isRoiRvClass(value: string): value is RoiRvClass {
  return (ROI_RV_CLASSES as readonly string[]).includes(value);
}

/** Seeded market rates when arriving from a market page (`?market=`). */
export type RoiMarketSeed = {
  marketSlug: string;
  marketName: string;
  distanceMiles: number;
  medianRate: number | null;
  rateSource: "class" | "market" | null;
  listingCount: number;
  classCount: number;
  city: string | null;
  state: string | null;
};

export function roiCalculatorHref(marketSlug?: string | null): string {
  if (!marketSlug) return "/tools/roi-calculator";
  return `/tools/roi-calculator?market=${encodeURIComponent(marketSlug)}`;
}

export function getClassAssumptions(rvClass: RoiRvClass): ClassAssumptions {
  return CLASS_ASSUMPTIONS[rvClass];
}

export function buildInitialInputs(
  rvClass: RoiRvClass = "Class C",
): RoiFormInputs {
  const c = getClassAssumptions(rvClass);
  return {
    rvClass,
    value: c.value,
    cashInvested: Math.round(c.value * ROI_SHARED_DEFAULTS.cashInvestedPct),
    zip: "",
    nightsPerYear: c.nightsPerYear,
    nightlyRate: ROI_SHARED_DEFAULTS.nightlyRateFallback,
    avgStayNights: c.avgStayNights,
    platformFeePct: ROI_SHARED_DEFAULTS.platformFeePct,
    insurance: c.insurance,
    storage: c.storage,
    registration: c.registration,
    annualLoanPayments: ROI_SHARED_DEFAULTS.annualLoanPayments,
    cleaningPerTurnover: c.cleaningPerTurnover,
    supplies: c.supplies,
    maintPctOfValue: ROI_SHARED_DEFAULTS.maintPctOfValue,
    includeDepreciation: ROI_SHARED_DEFAULTS.includeDepreciation,
    depreciationPct: ROI_SHARED_DEFAULTS.depreciationPct,
    taxRate: ROI_SHARED_DEFAULTS.taxRate,
    hoursPerWeek: ROI_SHARED_DEFAULTS.hoursPerWeek,
  };
}
