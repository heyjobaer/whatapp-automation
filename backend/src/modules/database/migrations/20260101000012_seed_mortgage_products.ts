import type { Knex } from 'knex';

/**
 * Seed sample UK mortgage products so the Mortgages page has content out of the box.
 *
 * These rates are ILLUSTRATIVE demo data (indicative, not live market rates) — a broker would keep
 * the real sourcing panel up to date. Dev-only: skipped entirely when NODE_ENV === 'production' (the
 * migration still records as run, it just inserts nothing there). Also idempotent in dev — it skips
 * if the table already has rows, so it never clobbers data you added yourself.
 */
const SAMPLE_PRODUCTS = [
  {
    lender: 'Nationwide',
    productName: '5 Year Fixed',
    category: 'home-mover',
    rateType: 'fixed',
    initialRate: 4.44,
    initialPeriodMonths: 60,
    followOnRate: 7.99,
    maxLtvPercent: 90,
    maxTermYears: 40,
    productFee: 999,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'Five-year fixed rate for home movers up to 90% LTV. Rate is fixed until the end of the initial period, then reverts to the lender SVR. Early repayment charges apply during the fixed term. Indicative rate.',
  },
  {
    lender: 'Halifax',
    productName: '2 Year Fixed',
    category: 'residential',
    rateType: 'fixed',
    initialRate: 4.79,
    initialPeriodMonths: 24,
    followOnRate: 8.24,
    maxLtvPercent: 85,
    maxTermYears: 40,
    productFee: 999,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'Two-year fixed for residential purchases and remortgages up to 85% LTV. Shorter tie-in if you expect to review sooner. ERCs apply during the fixed term. Indicative rate.',
  },
  {
    lender: 'NatWest',
    productName: '95% Mortgage 5 Year Fixed',
    category: 'first-time-buyer',
    rateType: 'fixed',
    initialRate: 5.34,
    initialPeriodMonths: 60,
    followOnRate: 7.74,
    maxLtvPercent: 95,
    maxTermYears: 40,
    productFee: 0,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'Five-year fixed for first-time buyers with just a 5% deposit (95% LTV), fee-free. Longer fix gives payment certainty while you settle in. Subject to affordability and credit checks. Indicative rate.',
  },
  {
    lender: 'Skipton Building Society',
    productName: 'Track Record 100% Mortgage',
    category: 'first-time-buyer',
    rateType: 'fixed',
    initialRate: 5.49,
    initialPeriodMonths: 60,
    followOnRate: 8.09,
    maxLtvPercent: 100,
    maxTermYears: 35,
    productFee: 0,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'A 100% LTV deposit-free mortgage for renters with a track record of paying rent on time. No family guarantor needed. Strict eligibility on rental history and affordability. Indicative rate.',
  },
  {
    lender: 'Barclays',
    productName: '2 Year Fixed Fee-Free',
    category: 'residential',
    rateType: 'fixed',
    initialRate: 5.09,
    initialPeriodMonths: 24,
    followOnRate: 8.49,
    maxLtvPercent: 85,
    maxTermYears: 35,
    productFee: 0,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'Fee-free two-year fixed up to 85% LTV — lower upfront cost if you would rather not add a product fee to the loan. ERCs apply during the fixed period. Indicative rate.',
  },
  {
    lender: 'HSBC',
    productName: '2 Year Tracker',
    category: 'residential',
    rateType: 'tracker',
    initialRate: 5.24,
    initialPeriodMonths: 24,
    followOnRate: 6.99,
    maxLtvPercent: 80,
    maxTermYears: 35,
    productFee: 999,
    repaymentType: 'repayment',
    ercApplies: false,
    status: 'available',
    description:
      'Two-year tracker at Bank of England base rate plus a set margin — your payments move up or down with the base rate. No early repayment charge, so you can overpay or switch freely. Indicative margin.',
  },
  {
    lender: 'Santander',
    productName: '5 Year Fixed Remortgage',
    category: 'remortgage',
    rateType: 'fixed',
    initialRate: 4.59,
    initialPeriodMonths: 60,
    followOnRate: 7.50,
    maxLtvPercent: 75,
    maxTermYears: 40,
    productFee: 999,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'Five-year fixed for remortgaging up to 75% LTV, with free standard valuation and legal work on eligible remortgages. Good for locking in a rate as your current deal ends. Indicative rate.',
  },
  {
    lender: 'Coventry Building Society',
    productName: '5 Year Fixed Low LTV',
    category: 'remortgage',
    rateType: 'fixed',
    initialRate: 4.39,
    initialPeriodMonths: 60,
    followOnRate: 7.49,
    maxLtvPercent: 65,
    maxTermYears: 40,
    productFee: 999,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'One of the lower five-year fixed rates, for borrowers with 35%+ equity (up to 65% LTV). Best suited to remortgages and movers with a large deposit. Indicative rate.',
  },
  {
    lender: 'TSB',
    productName: '3 Year Fixed',
    category: 'home-mover',
    rateType: 'fixed',
    initialRate: 4.89,
    initialPeriodMonths: 36,
    followOnRate: 8.24,
    maxLtvPercent: 85,
    maxTermYears: 40,
    productFee: 995,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'Three-year fixed for home movers up to 85% LTV — a middle ground between a two- and five-year tie-in. ERCs apply during the fixed period. Indicative rate.',
  },
  {
    lender: 'Nationwide',
    productName: 'Helping Hand FTB 5 Year Fixed',
    category: 'first-time-buyer',
    rateType: 'fixed',
    initialRate: 5.19,
    initialPeriodMonths: 60,
    followOnRate: 7.99,
    maxLtvPercent: 95,
    maxTermYears: 40,
    productFee: 999,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'First-time-buyer product that can lend up to 6x income (vs the usual 4.5x) on a five-year fix up to 95% LTV, to help you borrow more. Subject to minimum income and affordability rules. Indicative rate.',
  },
  {
    lender: 'The Mortgage Works',
    productName: 'Buy-to-Let 2 Year Fixed',
    category: 'buy-to-let',
    rateType: 'fixed',
    initialRate: 4.99,
    initialPeriodMonths: 24,
    followOnRate: 7.94,
    maxLtvPercent: 75,
    maxTermYears: 35,
    productFee: 1995,
    repaymentType: 'interest-only',
    ercApplies: true,
    status: 'available',
    description:
      'Two-year fixed buy-to-let on an interest-only basis up to 75% LTV. Lending is based on expected rental income (rental cover / stress test), not just personal income. Most BTL lending is not FCA-regulated. Indicative rate.',
  },
  {
    lender: 'Paragon',
    productName: 'Buy-to-Let 5 Year Fixed',
    category: 'buy-to-let',
    rateType: 'fixed',
    initialRate: 5.29,
    initialPeriodMonths: 60,
    followOnRate: 8.14,
    maxLtvPercent: 75,
    maxTermYears: 30,
    productFee: 1495,
    repaymentType: 'interest-only',
    ercApplies: true,
    status: 'available',
    description:
      'Five-year fixed buy-to-let up to 75% LTV, including options for HMOs and portfolio landlords. Longer fix eases the rental stress test. Most BTL lending is not FCA-regulated. Indicative rate.',
  },
  {
    lender: 'Virgin Money',
    productName: '2 Year Fixed',
    category: 'home-mover',
    rateType: 'fixed',
    initialRate: 4.94,
    initialPeriodMonths: 24,
    followOnRate: 8.24,
    maxLtvPercent: 90,
    maxTermYears: 35,
    productFee: 995,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'Two-year fixed for movers up to 90% LTV. A shorter tie-in for borrowers who expect rates to fall and want to review in two years. Indicative rate.',
  },
  {
    lender: 'First Direct',
    productName: '5 Year Fixed Fee-Free',
    category: 'remortgage',
    rateType: 'fixed',
    initialRate: 4.49,
    initialPeriodMonths: 60,
    followOnRate: 6.99,
    maxLtvPercent: 80,
    maxTermYears: 35,
    productFee: 0,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'Fee-free five-year fixed up to 80% LTV — competitive rate with no product fee, good for remortgages where you want to avoid adding fees to the balance. Indicative rate.',
  },
  {
    lender: 'Accord Mortgages',
    productName: '90% 3 Year Fixed',
    category: 'first-time-buyer',
    rateType: 'fixed',
    initialRate: 4.99,
    initialPeriodMonths: 36,
    followOnRate: 8.24,
    maxLtvPercent: 90,
    maxTermYears: 40,
    productFee: 495,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'Three-year fixed for first-time buyers with a 10% deposit (90% LTV), low £495 fee plus £500 cashback on completion on eligible products. Indicative rate.',
  },
  {
    lender: 'Halifax',
    productName: '5 Year Fixed Large Loan',
    category: 'residential',
    rateType: 'fixed',
    initialRate: 4.34,
    initialPeriodMonths: 60,
    followOnRate: 8.24,
    maxLtvPercent: 60,
    maxTermYears: 40,
    productFee: 1499,
    repaymentType: 'repayment',
    ercApplies: true,
    status: 'available',
    description:
      'Lower five-year fixed rate for larger loans at 60% LTV or below, where a higher product fee is offset by the reduced rate on a big balance. Indicative rate.',
  },
];

export async function up(knex: Knex): Promise<void> {
  // Dev-only demo data — never seed a production database.
  if (process.env.NODE_ENV === 'production') return;

  const [{ count }] = await knex('mortgage_products').count<{ count: string }[]>('* as count');
  if (Number(count) > 0) return; // already populated — leave existing data untouched
  await knex('mortgage_products').insert(SAMPLE_PRODUCTS);
}

export async function down(knex: Knex): Promise<void> {
  await knex('mortgage_products')
    .whereIn(
      'productName',
      SAMPLE_PRODUCTS.map(p => p.productName),
    )
    .del();
}
