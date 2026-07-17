"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Investigation } from "@/lib/types";
import { statusLabel } from "@/lib/format";

type Props = {
  investigation: Investigation;
};

type Action =
  | "save"
  | "add_source"
  | "add_timeline"
  | "add_response";

const internalStatuses = [
  "triagem",
  "em_apuracao",
  "arquivado"
] as const;

export function AdminInvestigationEditor({ investigation }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "success" | "error">("idle");

  async function send(action: Action, payload: Record<string, unknown>) {
    setPending(action);
    setMessage("");
    setState("idle");

    try {
      const response = await fetch(
        `/api/admin/investigacoes/${investigation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload })
        }
      );

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(
          data.message ?? "Não foi possível atualizar a investigação."
        );
      }

      setState("success");
      setMessage(data.message ?? "Investigação atualizada.");
      router.refresh();
      return true;
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Erro inesperado."
      );
      return false;
    } finally {
      setPending(null);
    }
  }

  async function saveCore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const involvedAmountText = String(
      formData.get("involvedAmount") ?? ""
    ).trim();

    await send("save", {
      title: String(formData.get("title") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      finding: String(formData.get("finding") ?? ""),
      status: String(formData.get("status") ?? investigation.status),
      confidence: String(
        formData.get("confidence") ?? investigation.confidence
      ),
      involvedAmount: involvedAmountText
        ? Number(involvedAmountText)
        : null,
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      methodology: String(formData.get("methodology") ?? ""),
      caveat: String(formData.get("caveat") ?? "")
    });
  }

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const saved = await send("add_source", {
      source: {
        title: String(formData.get("title") ?? ""),
        publisher: String(formData.get("publisher") ?? ""),
        url: String(formData.get("url") ?? ""),
        kind: String(formData.get("kind") ?? "documento"),
        note: String(formData.get("note") ?? "")
      }
    });

    if (saved) form.reset();
  }

  async function addTimeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const saved = await send("add_timeline", {
      item: {
        date: String(formData.get("date") ?? ""),
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? "")
      }
    });

    if (saved) form.reset();
  }

  async function addResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const saved = await send("add_response", {
      response: {
        author: String(formData.get("author") ?? ""),
        receivedAt: String(formData.get("receivedAt") ?? ""),
        content: String(formData.get("content") ?? ""),
        sourceUrl: String(formData.get("sourceUrl") ?? "")
      }
    });

    if (saved) form.reset();
  }

  const currentIsInternal = internalStatuses.includes(
    investigation.status as (typeof internalStatuses)[number]
  );

  return (
    <aside className="investigation-editor">
      <div className="investigation-editor-heading">
        <p className="eyebrow">MESA DE APURAÇÃO</p>
        <h2>Editar investigação</h2>
      </div>

      <form className="editorial-form" onSubmit={saveCore}>
        <label>
          Título interno
          <input
            name="title"
            required
            minLength={12}
            maxLength={220}
            defaultValue={investigation.title}
          />
        </label>

        <label>
          Resumo da pista
          <textarea
            name="summary"
            required
            minLength={40}
            rows={5}
            defaultValue={investigation.summary}
          />
        </label>

        <label>
          Achado central provisório
          <span>
            Escreva de forma proporcional à evidência. Não trate hipótese
            como fato.
          </span>
          <textarea
            name="finding"
            required
            minLength={40}
            rows={7}
            defaultValue={investigation.finding}
          />
        </label>

        <div className="form-grid two-columns">
          <label>
            Status interno
            <select name="status" defaultValue={investigation.status}>
              {!currentIsInternal ? (
                <option value={investigation.status}>
                  {statusLabel(investigation.status)}
                </option>
              ) : null}
              <option value="triagem">Em triagem</option>
              <option value="em_apuracao">Em apuração</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </label>

          <label>
            Força da evidência
            <select
              name="confidence"
              defaultValue={investigation.confidence}
            >
              <option value="pista">Pista</option>
              <option value="cruzamento">Cruzamento</option>
              <option value="documental">Documental</option>
            </select>
          </label>
        </div>

        <label>
          Valor relacionado
          <input
            name="involvedAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={investigation.involvedAmount ?? ""}
          />
        </label>

        <label>
          Tags
          <span>Separadas por vírgula.</span>
          <input
            name="tags"
            defaultValue={investigation.tags.join(", ")}
          />
        </label>

        <label>
          Metodologia aplicada
          <textarea
            name="methodology"
            required
            minLength={30}
            rows={6}
            defaultValue={investigation.methodology}
          />
        </label>

        <label>
          Ressalvas e limites
          <textarea
            name="caveat"
            required
            minLength={20}
            rows={6}
            defaultValue={investigation.caveat}
          />
        </label>

        <button
          className="button button-dark"
          type="submit"
          disabled={pending !== null}
        >
          {pending === "save" ? "Salvando…" : "Salvar investigação"}
        </button>
      </form>

      <details className="investigation-add-box">
        <summary>Adicionar documento ou fonte</summary>
        <form className="editorial-form" onSubmit={addSource}>
          <label>
            Título da fonte
            <input name="title" required minLength={4} maxLength={220} />
          </label>
          <label>
            Instituição ou publicador
            <input
              name="publisher"
              required
              minLength={2}
              maxLength={160}
            />
          </label>
          <label>
            URL
            <input name="url" type="url" required />
          </label>
          <label>
            Tipo
            <select name="kind" defaultValue="documento">
              <option value="dado_oficial">Dado oficial</option>
              <option value="documento">Documento</option>
              <option value="declaracao">Declaração</option>
              <option value="resposta">Resposta</option>
              <option value="verificacao_local">
                Verificação local
              </option>
            </select>
          </label>
          <label>
            Nota interna
            <textarea name="note" rows={4} maxLength={1500} />
          </label>
          <button
            className="button button-primary"
            type="submit"
            disabled={pending !== null}
          >
            {pending === "add_source" ? "Adicionando…" : "Adicionar fonte"}
          </button>
        </form>
      </details>

      <details className="investigation-add-box">
        <summary>Adicionar evento à linha do tempo</summary>
        <form className="editorial-form" onSubmit={addTimeline}>
          <label>
            Data
            <input name="date" type="date" required />
          </label>
          <label>
            Título
            <input name="title" required minLength={4} maxLength={180} />
          </label>
          <label>
            Descrição
            <textarea
              name="description"
              required
              minLength={10}
              rows={4}
            />
          </label>
          <button
            className="button button-primary"
            type="submit"
            disabled={pending !== null}
          >
            {pending === "add_timeline"
              ? "Adicionando…"
              : "Adicionar evento"}
          </button>
        </form>
      </details>

      <details className="investigation-add-box">
        <summary>Registrar manifestação recebida</summary>
        <form className="editorial-form" onSubmit={addResponse}>
          <label>
            Autor da manifestação
            <input name="author" required minLength={2} maxLength={180} />
          </label>
          <label>
            Data de recebimento
            <input name="receivedAt" type="date" required />
          </label>
          <label>
            Conteúdo
            <textarea name="content" required minLength={10} rows={6} />
          </label>
          <label>
            Fonte ou documento
            <input name="sourceUrl" type="url" />
          </label>
          <button
            className="button button-primary"
            type="submit"
            disabled={pending !== null}
          >
            {pending === "add_response"
              ? "Registrando…"
              : "Registrar manifestação"}
          </button>
        </form>
      </details>

      {message ? (
        <p className={`form-message ${state}`}>{message}</p>
      ) : null}

      <p className="investigation-publication-warning">
        Esta tela não publica casos. A publicação continuará bloqueada até
        existir revisão documental, contraditório e uma etapa editorial
        específica.
      </p>
    </aside>
  );
}
