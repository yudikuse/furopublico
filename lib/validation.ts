import { z } from "zod";
import { investigationCategories, investigationStatuses } from "@/lib/types";

export const tipSchema = z.object({
  name: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").max(180).optional().or(z.literal("")),
  title: z.string().trim().min(8, "Explique o assunto em pelo menos 8 caracteres").max(180),
  description: z.string().trim().min(40, "A descrição precisa ter pelo menos 40 caracteres").max(10_000),
  sourceUrls: z.string().trim().max(5_000).optional().or(z.literal("")),
  consent: z.literal(true),
  website: z.string().max(0).optional().or(z.literal(""))
});

export const investigationInputSchema = z.object({
  title: z.string().trim().min(12).max(220),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens"),
  summary: z.string().trim().min(40).max(1_000),
  finding: z.string().trim().min(40).max(3_000),
  category: z.enum(investigationCategories),
  status: z.enum(investigationStatuses),
  confidence: z.enum(["pista", "cruzamento", "documental"]),
  state: z.string().trim().max(2).optional().or(z.literal("")),
  municipality: z.string().trim().max(120).optional().or(z.literal("")),
  involvedAmount: z.coerce.number().nonnegative().optional(),
  tags: z.string().trim().max(1_000).optional().or(z.literal("")),
  sourceUrls: z.string().trim().min(5).max(10_000),
  methodology: z.string().trim().min(30).max(5_000),
  caveat: z.string().trim().min(20).max(3_000),
  isFeatured: z.boolean().default(false),
  publishNow: z.boolean().default(false)
});
