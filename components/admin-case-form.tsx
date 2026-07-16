"use client";

import { useState, type FormEvent } from "react";
import { investigationCategories, investigationStatuses } from "@/lib/types";
import { categoryLabel, statusLabel } from "@/lib/format";

export function AdminCaseForm() {
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    const form = event.currentTarget;
    const payload: Record<string, unknown> = Object.fromEntries(new FormData(form).entries());
    payload.isFeatured = payload.isFeatured === "on";
    payload.publishNow = payload.publishNow === "on";
    if (!payload.involvedAmount) delete payload.involvedAmount;

    try {
      const response = await fetch("/api/admin/investigacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { message?: string; slug?: string };
      if (!response.ok) throw new Error(data.message ?? "Erro ao salvar investigação");
      setState("success");
      setMessage(`Investigação salva${data.slug ? `: /investigacoes/${data.slug}` : ""}`);
      form.reset();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Erro inesperado");
    }
  }

  return (
    <form className="editorial-form admin-form" onSubmit={submit}>
      <label>Título<input name="title" required minLength={12} maxLength={220} /></label>
      <label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="titulo-da-investigacao" /></label>
      <label>Resumo<textarea name="summary" required minLength={40} rows={4} /></label>
      <label>Achado central<textarea name="finding" required minLength={40} rows={5} /></label>
      <div className="form-grid three-columns">
        <label>Categoria<select name="category" defaultValue="despesas">{investigationCategories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select></label>
        <label>Status<select name="status" defaultValue="em_apuracao">{investigationStatuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
        <label>Força da evidência<select name="confidence" defaultValue="pista"><option value="pista">Pista</option><option value="cruzamento">Cruzamento</option><option value="documental">Documental</option></select></label>
      </div>
      <div className="form-grid three-columns">
        <label>UF<input name="state" maxLength={2} /></label>
        <label>Município<input name="municipality" /></label>
        <label>Valor envolvido<input name="involvedAmount" type="number" min="0" step="0.01" /></label>
      </div>
      <label>Tags <span>separadas por vírgula</span><input name="tags" /></label>
      <label>Fontes <span>uma URL por linha; nunca publique sem fonte verificável</span><textarea name="sourceUrls" required rows={5} /></label>
      <label>Metodologia aplicada<textarea name="methodology" required minLength={30} rows={5} /></label>
      <label>Ressalva e limites<textarea name="caveat" required minLength={20} rows={4} /></label>
      <div className="checkbox-stack">
        <label className="checkbox-row"><input name="isFeatured" type="checkbox" /><span>Destacar na página inicial</span></label>
        <label className="checkbox-row"><input name="publishNow" type="checkbox" /><span>Publicar agora. Só marque após revisão documental e pedido de resposta.</span></label>
      </div>
      <button className="button button-primary" type="submit" disabled={state === "sending"}>{state === "sending" ? "Salvando…" : "Salvar investigação"}</button>
      {message ? <p className={`form-message ${state}`}>{message}</p> : null}
    </form>
  );
}
