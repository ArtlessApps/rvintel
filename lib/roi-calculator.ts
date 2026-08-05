export type RoiInputs = {
  value: number;
  cashInvested: number;
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

export type RoiExpenseLine = {
  key: string;
  label: string;
  amount: number;
};

export type RoiResult = {
  gross: number;
  platformFees: number;
  turnovers: number;
  cleaning: number;
  maintenance: number;
  fixed: number;
  totalExpenses: number;
  noi: number;
  cashOnCash: number | null;
  paybackYears: number | null;
  depreciation: number;
  economicNoi: number;
  economicRoi: number | null;
  afterTaxNoi: number;
  afterTaxRoi: number | null;
  annualHours: number;
  dollarsPerHour: number | null;
  expenses: RoiExpenseLine[];
};

function clampNonNeg(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Pure ROI engine — no I/O. All amounts are annual USD unless noted. */
export function calculateRoi(raw: RoiInputs): RoiResult {
  const value = clampNonNeg(raw.value);
  const cashInvested = clampNonNeg(raw.cashInvested);
  const nights = clampNonNeg(raw.nightsPerYear);
  const rate = clampNonNeg(raw.nightlyRate);
  const avgStay = Math.max(1, clampNonNeg(raw.avgStayNights) || 1);
  const feePct = Math.min(1, Math.max(0, raw.platformFeePct));
  const maintPct = Math.min(1, Math.max(0, raw.maintPctOfValue));
  const depPct = Math.min(1, Math.max(0, raw.depreciationPct));
  const taxRate = Math.min(1, Math.max(0, raw.taxRate));

  const gross = rate * nights;
  const platformFees = gross * feePct;
  const turnovers = nights / avgStay;
  const cleaning = turnovers * clampNonNeg(raw.cleaningPerTurnover);
  const maintenance = value * maintPct;
  const insurance = clampNonNeg(raw.insurance);
  const storage = clampNonNeg(raw.storage);
  const registration = clampNonNeg(raw.registration);
  const loan = clampNonNeg(raw.annualLoanPayments);
  const supplies = clampNonNeg(raw.supplies);
  const fixed = insurance + storage + registration + loan;

  const expenses: RoiExpenseLine[] = [
    { key: "platform", label: "Platform fees", amount: platformFees },
    { key: "cleaning", label: "Cleaning & turnovers", amount: cleaning },
    { key: "maintenance", label: "Maintenance & repairs", amount: maintenance },
    { key: "insurance", label: "Insurance", amount: insurance },
    { key: "storage", label: "Storage", amount: storage },
    { key: "registration", label: "Registration & taxes", amount: registration },
    { key: "loan", label: "Loan payments", amount: loan },
    { key: "supplies", label: "Supplies & restock", amount: supplies },
  ].filter((line) => line.amount > 0.5);

  const totalExpenses =
    platformFees + cleaning + maintenance + supplies + fixed;
  const noi = gross - totalExpenses;

  const cashOnCash = cashInvested > 0 ? noi / cashInvested : null;
  const paybackYears =
    cashInvested > 0 && noi > 0 ? cashInvested / noi : null;

  const depreciation = raw.includeDepreciation ? value * depPct : 0;
  const economicNoi = noi - depreciation;
  const economicRoi = cashInvested > 0 ? economicNoi / cashInvested : null;

  const afterTaxNoi = noi > 0 ? noi * (1 - taxRate) : noi;
  const afterTaxRoi = cashInvested > 0 ? afterTaxNoi / cashInvested : null;

  const annualHours = clampNonNeg(raw.hoursPerWeek) * 52;
  const dollarsPerHour =
    annualHours > 0 && noi > 0 ? noi / annualHours : null;

  return {
    gross,
    platformFees,
    turnovers,
    cleaning,
    maintenance,
    fixed,
    totalExpenses,
    noi,
    cashOnCash,
    paybackYears,
    depreciation,
    economicNoi,
    economicRoi,
    afterTaxNoi,
    afterTaxRoi,
    annualHours,
    dollarsPerHour,
    expenses,
  };
}

export function formatUsd(n: number, compact = false): string {
  if (!Number.isFinite(n)) return "—";
  if (compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPct(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}
