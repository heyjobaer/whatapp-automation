/** A real-estate listing (the "product"). Columns are camelCase to match the rest of the schema. */
export interface Property {
  id: string;
  name: string;
  area: string;
  type: string;
  bedrooms: number;
  priceAed: number;
  priceUsd: number;
  roiPercent: number;
  status: string;
  handoverDate?: string | null;
  isOffplan: boolean;
  developer?: string | null;
  description?: string | null;
  brochureUrl?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyPage {
  data: Property[];
  total: number;
}
