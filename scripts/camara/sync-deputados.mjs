import path from "node:path";
import { API_BASE, fetchAllPages, getArg, writeJson } from "./utils.mjs";

const legislature = getArg("legislatura", "57");
const items = getArg("itens", "100");
const maxPages = Number(getArg("max-pages", "999"));
const url = `${API_BASE}/deputados?idLegislatura=${encodeURIComponent(legislature)}&itens=${items}&pagina=1&ordem=ASC&ordenarPor=nome`;

console.log(`Coletando deputados que exerceram mandato na legislatura ${legislature}...`);
const deputies = await fetchAllPages(url, { maxPages });
const output = path.resolve(`data/raw/deputados-l${legislature}.json`);
await writeJson(output, {
  metadata: {
    source: url,
    legislature: Number(legislature),
    collectedAt: new Date().toISOString(),
    count: deputies.length
  },
  data: deputies
});
