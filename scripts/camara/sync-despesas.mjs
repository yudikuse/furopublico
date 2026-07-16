import path from "node:path";
import { API_BASE, fetchAllPages, getArg, hasFlag, readJson, sleep, writeJson } from "./utils.mjs";

const legislature = getArg("legislatura", "57");
const year = Number(getArg("year", String(new Date().getUTCFullYear())));
const state = String(getArg("state", "")).toUpperCase();
const all = hasFlag("all");
const limit = all ? Infinity : Number(getArg("limit", "20"));
const deputiesFile = path.resolve(`data/raw/deputados-l${legislature}.json`);
const deputiesPayload = await readJson(deputiesFile);
let deputies = deputiesPayload.data ?? [];
if (state) deputies = deputies.filter((deputy) => String(deputy.siglaUf ?? "").toUpperCase() === state);
deputies = deputies.slice(0, limit);

if (year < 2023 || year > 2027) throw new Error("Este projeto monitora a 57ª Legislatura. Use um ano de 2023 a 2027.");
console.log(`Coletando despesas de ${deputies.length} deputados para ${year}${state ? ` em ${state}` : ""}...`);

const records = [];
const errors = [];
for (let index = 0; index < deputies.length; index += 1) {
  const deputy = deputies[index];
  const url = `${API_BASE}/deputados/${deputy.id}/despesas?ano=${year}&itens=100&pagina=1&ordem=ASC&ordenarPor=dataDocumento`;
  try {
    console.log(`[${index + 1}/${deputies.length}] ${deputy.nome}`);
    const expenses = await fetchAllPages(url, { delayMs: 80 });
    for (const expense of expenses) {
      records.push({
        ...expense,
        idDeputado: deputy.id,
        nomeDeputado: deputy.nome,
        siglaPartidoDeputado: deputy.siglaPartido,
        siglaUfDeputado: deputy.siglaUf
      });
    }
  } catch (error) {
    errors.push({ deputyId: deputy.id, deputyName: deputy.nome, message: String(error) });
    console.error(`Falha em ${deputy.nome}:`, error);
  }
  await sleep(130);
}

const suffix = state ? `-${state.toLowerCase()}` : all ? "-brasil" : `-amostra-${deputies.length}`;
const output = path.resolve(`data/raw/despesas-l${legislature}-${year}${suffix}.json`);
await writeJson(output, {
  metadata: {
    source: "Dados Abertos da Câmara dos Deputados /api/v2/deputados/{id}/despesas",
    legislature: Number(legislature),
    year,
    state: state || null,
    allDeputies: all,
    deputiesProcessed: deputies.length,
    collectedAt: new Date().toISOString(),
    records: records.length,
    errors
  },
  data: records
});
