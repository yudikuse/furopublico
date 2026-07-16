"use client";

import { useMemo, useState } from "react";
import type { Investigation } from "@/lib/types";
import { categoryLabel } from "@/lib/format";
import { InvestigationCard } from "@/components/investigation-card";
import { SearchIcon } from "@/components/icons";

export function FilterBar({ investigations }: { investigations: Investigation[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("todas");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return investigations.filter((item) => {
      const matchesCategory = category === "todas" || item.category === category;
      const haystack = [
        item.title,
        item.summary,
        item.finding,
        item.state,
        item.municipality,
        ...item.tags,
        ...item.entities.map((entity) => entity.name)
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      return matchesCategory && (!normalized || haystack.includes(normalized));
    });
  }, [category, investigations, query]);

  const categories = Array.from(new Set(investigations.map((item) => item.category)));

  return (
    <>
      <div className="filter-panel">
        <label className="search-field">
          <SearchIcon />
          <span className="sr-only">Pesquisar investigações</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pessoa, empresa, município ou palavra-chave"
          />
        </label>
        <label>
          <span className="sr-only">Categoria</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="todas">Todas as categorias</option>
            {categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
          </select>
        </label>
      </div>
      <p className="results-count">{filtered.length} {filtered.length === 1 ? "investigação encontrada" : "investigações encontradas"}</p>
      <div className="investigation-grid">
        {filtered.map((item) => <InvestigationCard key={item.id} investigation={item} />)}
      </div>
      {filtered.length === 0 ? <div className="empty-state">Nenhuma investigação corresponde aos filtros.</div> : null}
    </>
  );
}
