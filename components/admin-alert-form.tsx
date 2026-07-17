"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { InvestigationAlert } from "@/lib/types";

type Props = {
  alert: InvestigationAlert;
};

export function AdminAlertForm({ alert }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: "save" | "convert"
  ) {
    event.preventDefault();
    setState("sending");
    setMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      action,
      status: String(formData.get("status") ?? "novo"),
      reviewerNotes: String(formData.get("reviewerNotes") ?? "")
    };

    try {
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
    }
  }

  return (
    <form className="editorial-form admin-alert-form">
      <label>
        Status editorial
        <select name="status" defaultValue={alert.status}>
          <option value="novo">Novo</option>
          <option value="em_revisao">Em revisão</option>
          <option value="descartado">Descartado</option>
          <option value="convertido">Convertido</option>
        </select>
      </label>

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
          placeholder="Ex.: conferir se o gasto é anual, localizar notas fiscais, solicitar esclarecimentos ao gabinete..."
        />
      </label>

      <div className="admin-form-actions">
        <button
          type="button"
          className="button button-dark"
          disabled={state === "sending"}
          onClick={(event) =>
            submit(
              {
                ...event,
                preventDefault: () => event.preventDefault(),
                currentTarget: event.currentTarget.closest("form")
              } as unknown as FormEvent<HTMLFormElement>,
              "save"
            )
          }
        >
          {state === "sending" ? "Salvando…" : "Salvar revisão"}
        </button>

        <button
          type="button"
          className="button button-primary"
          disabled={state === "sending" || alert.status === "convertido"}
          onClick={(event) => {
            const form = event.currentTarget.closest("form");
            if (!form) return;
            const synthetic = {
              preventDefault: () => undefined,
              currentTarget: form
            } as unknown as FormEvent<HTMLFormElement>;
            submit(synthetic, "convert");
          }}
        >
          Converter em investigação
        </button>
      </div>

      {message ? (
        <p className={`form-message ${state}`}>{message}</p>
      ) : null}
    </form>
  );
}
