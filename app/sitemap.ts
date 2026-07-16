import type { MetadataRoute } from "next";
import { getPublishedInvestigations } from "@/lib/data";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> { const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"; const investigations = await getPublishedInvestigations(); return ["", "/investigacoes", "/metodologia", "/denuncie", "/direito-de-resposta"].map((path) => ({ url: `${base}${path}`, lastModified: new Date() })).concat(investigations.map((item) => ({ url: `${base}/investigacoes/${item.slug}`, lastModified: new Date(item.updatedAt) }))); }
