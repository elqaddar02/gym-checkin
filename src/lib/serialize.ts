import type { CheckIn, Member, Subscription } from "@/generated/prisma/client";
import { dbDateToYmd } from "./dates";
import type { ReceptionMember, SubscriptionDTO } from "./types";

export function toSubscriptionDTO(s: Subscription): SubscriptionDTO {
  return {
    id: s.id,
    status: s.status,
    amount: s.amount,
    startDate: dbDateToYmd(s.startDate),
    endDate: dbDateToYmd(s.endDate),
    paymentMethod: s.paymentMethod,
    receiptNumber: s.receiptNumber,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    createdBy: s.createdBy,
  };
}

export function toReceptionMember(
  m: Member & { subscriptions: Subscription[]; checkIns: Pick<CheckIn, "checkedInAt">[] },
): ReceptionMember {
  return {
    id: m.id,
    name: m.name,
    phone: m.phone,
    notes: m.notes,
    subscriptions: m.subscriptions.map((s) => {
      const dto = toSubscriptionDTO(s);
      return { status: dto.status, startDate: dto.startDate, endDate: dto.endDate, createdAt: dto.createdAt };
    }),
    lastCheckInAt: m.checkIns[0]?.checkedInAt.toISOString() ?? null,
  };
}
