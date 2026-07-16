"use client";

import { useState, type FormEvent } from "react";

export function TipForm() {
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setMessage("");

    const form = event.currentTarget;
    const payload: Record<string, unknown> = Object.fromEntries(new FormData(form).entries());
    payload.consent = payload.consent === "on";

    try {
      const response = await fetch("/api/denuncias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Não foi possível enviar a pista.");
      setState("success");
      setMessage(data.message ?? "Pista recebida.");
      form.reset();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    }
  }

  return (
    <form className="editorial-form" onSubmit={submit}>
      <div className="form-grid two-columns">
        <label>Nome ou pseudônimo <span>opcional</span><input name="name" maxLength={120} /></label>
        <label>E-mail para retorno <span>opcional</span><input name="email" type="email" maxLength={180} /></label>
      </div>
      <label>Assunto da pista<input name="title" required minLength={8} maxLength={180} /></label>
      <label>O que aconteceu?<textarea name="description" required minLength={40} maxLength={10000} rows={8} /></label>
      <label>Links ou fontes <span>um por linha</span><textarea name="sourceUrls" rows={4} maxLength={5000} /></label>
      <label className="honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <label className="checkbox-row">
        <input name="consent" type="checkbox" required />
        <span>Confirmo que estou enviando a informação de boa-fé e autorizo o contato editorial para verificação.</span>
      </label>
      <button className="button button-primary" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Enviando…" : "Enviar pista com segurança"}
      </button>
      {message ? <p className={`form-message ${state}`}>{message}</p> : null}
    </form>
  );
}
