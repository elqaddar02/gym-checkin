// Plain JSON shapes shared by API routes and client components.

export type SubscriptionStatus = "active" | "expired" | "paused";
export type PaymentMethod = "cash" | "card" | "transfer";
export type OverrideReason = "cash_paid" | "owner_approved" | "other";

export interface SubscriptionDTO {
  id: string;
  status: SubscriptionStatus;
  amount: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  receiptNumber: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
}

/** What the reception tablet caches. */
export interface ReceptionMember {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  subscriptions: Pick<SubscriptionDTO, "status" | "startDate" | "endDate" | "createdAt">[];
  lastCheckInAt: string | null;
}

export interface CheckInInput {
  id: string;
  memberId: string;
  checkedInAt: string;
  overrideReason: OverrideReason | null;
}

export const OVERRIDE_LABELS: Record<OverrideReason, string> = {
  cash_paid: "Paie en espèces aujourd'hui",
  owner_approved: "Accord du propriétaire",
  other: "Autre",
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Espèces",
  card: "Carte",
  transfer: "Virement",
};

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Actif",
  expired: "Expiré",
  paused: "En pause",
};
