export interface SessionInfo {
  id: string;
  name: string;
  status: string;
  phone?: string;
  pushName?: string;
  connectedAt?: string;
}

export interface SessionStats {
  active: number;
  total: number;
  byStatus: Record<string, number>;
}
