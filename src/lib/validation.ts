import { z } from "zod";
import { normalizePhone } from "./phone";

const optionalText = z
  .string()
  .trim()
  .max(1000)
  .nullish()
  .transform((v) => (v ? v : null));

export const phoneSchema = z
  .string()
  .transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Numéro de téléphone invalide" });
      return z.NEVER;
    }
    return phone;
  });

export const subscriptionSchema = z
  .object({
    status: z.enum(["active", "expired", "paused"]).default("active"),
    amount: z.coerce.number().int().min(0).max(1_000_000),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    paymentMethod: z.enum(["cash", "card", "transfer"]),
    receiptNumber: optionalText,
    notes: optionalText,
  })
  .refine((s) => s.endDate >= s.startDate, {
    message: "La date de fin doit être après la date de début",
    path: ["endDate"],
  });

export const memberCreateSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(200),
  phone: phoneSchema,
  notes: optionalText,
  subscription: subscriptionSchema.nullish(),
});

export const memberUpdateSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(200).optional(),
  phone: phoneSchema.optional(),
  notes: optionalText.optional(),
});

export const checkInSchema = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  checkedInAt: z.iso.datetime({ offset: true }),
  overrideReason: z.enum(["cash_paid", "owner_approved", "other"]).nullish(),
});

export const checkInBatchSchema = z.object({
  checkIns: z.array(z.unknown()).max(1000),
});

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides";
}
