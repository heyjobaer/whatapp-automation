/**
 * A UK mortgage product (the broker's "product list"). One row = one lender product the AI can
 * quote and match clients against. Columns are camelCase to match the rest of the schema; rates and
 * fees are `double precision` so pg returns plain JS numbers.
 */
export interface MortgageProduct {
  id: string;
  lender: string;
  productName: string;
  /** residential | first-time-buyer | home-mover | remortgage | buy-to-let */
  category: string;
  /** fixed | tracker | discount | variable */
  rateType: string;
  /** Initial (headline) rate, e.g. 4.59 (%). */
  initialRate: number;
  /** How long the initial rate lasts, in months (e.g. 24, 60). 0 = variable/no fixed period. */
  initialPeriodMonths: number;
  /** The rate the loan reverts to after the initial period (lender SVR), e.g. 7.99 (%). */
  followOnRate?: number | null;
  /** Maximum loan-to-value, e.g. 90 (%). Deposit needed = 100 - maxLtvPercent. */
  maxLtvPercent: number;
  /** Maximum mortgage term in years (e.g. 40). */
  maxTermYears: number;
  /** Product/arrangement fee in GBP (0 = fee-free). */
  productFee: number;
  /** repayment | interest-only */
  repaymentType: string;
  /** Whether an early repayment charge applies during the initial period. */
  ercApplies: boolean;
  /** available | withdrawn */
  status: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MortgageProductPage {
  data: MortgageProduct[];
  total: number;
}
