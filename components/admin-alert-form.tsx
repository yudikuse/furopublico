"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InvestigationAlert } from "@/lib/types";

type Props = {
  alert: InvestigationAlert;
};

type Action = "save" | "convert" | "enrich";

export function AdminAlertForm({ alert }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [state, setState] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function run(action: Action) {
    const form = formRef.current;
    if (!form) return;

    setPendingAction(action);
    setState("idle");
    setMessage("");

    try {
      if (action === "enrich") {
        const response = await fetch(`/api/admin/alertas/${alert.id}/enriquecer`, {
          method: "POST"
        });
        const data = (await response.json()) as { message?: string };
        if (!response.ok) throw new Error(data.message ?? "Falha no enriquecimento.");
        setState("success");
        setMessage(data.message ?? "Dossiê automático atualizado.");
        router.refresh();
        return;
      }

      const formData = new FormData(form);
      const payload = {
        action,
        status: String(formData.get("status") ?? "novo"),
        reviewerNotes: String(formData.get("reviewerNotes") ?? "")
      };

      const response = await fetch(`/api/admin/alertas/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = (await response.json()) as {
        message?: string;
        investigationId?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Não foi possível atualizar o alerta.");
      }

      setState("success");
      setMessage(data.message ?? "Alerta atualizado.");
      router.refresh();

      if (action === "convert" && data.investigationId) {
        window.setTimeout(() => {
          window.location.href = "/admin";
        }, 900);
      }
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setPendingAction(null);
    }
  }

  const busy = pendingAction !== null;
  const parliamentaryAlert =
    alert.evidence.consolidationLevel === "deputy";

  return (
    <form ref={formRef} className="editorial-form admin-alert-form">
      {parliamentaryAlert ? (
        <div className="parliamentary-dossier-note">
          <strong>Dossiê parlamentar consolidado</strong>
          <p>
            Os sinais, categorias, fornecedores e documentos já estão
            reunidos acima. O enriquecimento empresarial será executado
            somente para fornecedores escolhidos durante a apuração.
          </p>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="button button-enrichment"
            disabled={busy}
            onClick={() => run("enrich")}
          >
            {pendingAction === "enrich"
              ? "Cruzando dados…"
              : alert.enrichment
                ? "Atualizar dossiê automático"
                : "Gerar dossiê automático"}
          </button>

          <p className="form-helper">
            Consulta o histórico da Câmara, compara a categoria e
            busca o cadastro do fornecedor.
          </p>
        </>
      )}

      {alert.investigationId ? (
        <label>
          Status editorial
          <input value="Convertido em investigação" disabled />
          <input type="hidden" name="status" value="convertido" />
        </label>
      ) : (
        <label>
          Status editorial
          <select name="status" defaultValue={alert.status}>
            <option value="novo">Novo</option>
            <option value="em_revisao">Em revisão</option>
            <option value="descartado">Descartado</option>
            <option value="convertido">Convertido</option>
          </select>
        </label>
      )}

      <label>
        Notas privadas da apuração
        <span>
          Registre o que já foi conferido, hipóteses alternativas, documentos
          faltantes e contatos realizados.
        </span>
        <textarea
          name="reviewerNotes"
          rows={10}
          defaultValue={alert.reviewerNotes ?? ""}
          placeholder="Ex.: separar aluguel de IPTU, identificar o proprietário, comparar imóveis equivalentes e solicitar o contrato ao gabinete."
        />
      </label>

      <div className="admin-form-actions">
        <button
          type="button"
          className="button button-dark"
          disabled={busy}
          onClick={() => run("save")}
        >
          {pendingAction === "save" ? "Salvando…" : "Salvar revisão"}
        </button>

        {alert.investigationId ? (
          <Link
            className="button button-primary"
            href={`/admin/investigacoes/${alert.investigationId}`}
          >
            Abrir investigação
          </Link>
        ) : (
          <button
            type="button"
            className="button button-primary"
            disabled={busy || alert.status === "convertido"}
            onClick={() => run("convert")}
          >
            {pendingAction === "convert"
              ? "Convertendo…"
              : "Converter em investigação"}
          </button>
        )}
      </div>

      {message ? <p className={`form-message ${state}`}>{message}</p> : null}
    </form>
  );
}
