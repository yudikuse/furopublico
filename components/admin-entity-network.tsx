"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type {
  AlertEntityNetwork,
  AlertNetworkEntity,
  EntityVerification
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = {
  alertId: string;
  network?: AlertEntityNetwork;
  defaultSourceUrl?: string;
};

function verificationLabel(value: EntityVerification) {
  const labels: Record<EntityVerification, string> = {
    camara: "Confirmado na Câmara",
    documento: "Documentado",
    cadastro: "Cadastro empresarial",
    coincidencia: "Coincidência a conferir",
    nao_verificado: "Não verificado"
  };
  return labels[value];
}

function entityTypeLabel(value: AlertNetworkEntity["type"]) {
  return {
    pessoa: "Pessoa",
    empresa: "Empresa",
    imovel: "Imóvel",
    orgao: "Órgão"
  }[value];
}

export function AdminEntityNetwork({
  alertId,
  network,
  defaultSourceUrl
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "success" | "error">("idle");
  const [entityType, setEntityType] = useState<
    AlertNetworkEntity["type"]
  >("empresa");

  const entityNames = useMemo(
    () =>
      new Map(
        (network?.entities ?? []).map((entity) => [entity.id, entity.name])
      ),
    [network]
  );

  async function send(payload: Record<string, unknown>) {
    setPending(true);
    setMessage("");
    setState("idle");

    try {
      const response = await fetch(
        `/api/admin/alertas/${alertId}/entidades`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "Não foi possível atualizar a rede.");
      }

      setState("success");
      setMessage(data.message ?? "Rede atualizada.");
      router.refresh();
      return true;
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Erro inesperado."
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  async function addEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const saved = await send({
      action: "add",
      entity: {
        name: String(formData.get("name") ?? ""),
        type: String(formData.get("type") ?? "empresa"),
        role: String(formData.get("role") ?? ""),
        taxId: String(formData.get("taxId") ?? ""),
        sourceUrl: String(formData.get("sourceUrl") ?? ""),
        sourceNote: String(formData.get("sourceNote") ?? ""),
        verification: String(
          formData.get("verification") ?? "documento"
        )
      }
    });

    if (saved) {
      form.reset();
      setEntityType("empresa");
    }
  }

  return (
    <section className="entity-network">
      <div className="panel-heading entity-network-heading">
        <div>
          <p className="eyebrow">REDE DE ENTIDADES</p>
          <h2>Partes, empresas, sócios e relações</h2>
        </div>

        <button
          type="button"
          className="button button-dark"
          disabled={pending}
          onClick={() => send({ action: "rebuild" })}
        >
          {pending ? "Atualizando…" : "Recalcular rede"}
        </button>
      </div>

      <p className="admin-warning">
        A rede separa fatos documentados de coincidências. O sistema não
        conclui parentesco, favorecimento ou propriedade por sobrenome,
        endereço comum ou simples participação societária.
      </p>

      <details className="entity-add-panel" open={!network}>
        <summary>Adicionar parte encontrada no documento</summary>

        <form className="editorial-form" onSubmit={addEntity}>
          <div className="form-grid three-columns">
            <label>
              Nome ou razão social
              <span>
                Para empresa com CNPJ válido, este campo é opcional: a razão
                social será obtida do cadastro.
              </span>
              <input
                name="name"
                required={entityType !== "empresa"}
                minLength={2}
                maxLength={220}
                placeholder={
                  entityType === "empresa"
                    ? "Opcional quando o CNPJ estiver preenchido"
                    : "Informe o nome da parte"
                }
              />
            </label>

            <label>
              Tipo
              <select
                name="type"
                value={entityType}
                onChange={(event) =>
                  setEntityType(
                    event.target.value as AlertNetworkEntity["type"]
                  )
                }
              >
                <option value="empresa">Empresa</option>
                <option value="pessoa">Pessoa</option>
                <option value="imovel">Imóvel</option>
                <option value="orgao">Órgão</option>
              </select>
            </label>

            <label>
              CNPJ/CPF, quando houver
              <span>
                Para empresa, informe o CNPJ para preencher a razão social
                automaticamente.
              </span>
              <input
                name="taxId"
                inputMode="numeric"
                maxLength={18}
                placeholder="00.000.000/0000-00"
              />
            </label>
          </div>

          <label>
            Papel no documento
            <input
              name="role"
              required
              minLength={3}
              maxLength={180}
              placeholder="Ex.: locadora, proprietária, administradora, beneficiária"
            />
          </label>

          <label>
            Fonte
            <input
              name="sourceUrl"
              type="url"
              defaultValue={defaultSourceUrl ?? ""}
              placeholder="https://..."
            />
          </label>

          <label>
            Trecho ou fundamento
            <span>
              Descreva exatamente onde o papel aparece. Não registre
              interpretação como se fosse fato.
            </span>
            <textarea
              name="sourceNote"
              required
              minLength={10}
              maxLength={3000}
              rows={4}
              placeholder='Ex.: no cabeçalho do demonstrativo consta “Locador: Empresa X, CNPJ...”'
            />
          </label>

          <label>
            Grau de verificação
            <select name="verification" defaultValue="documento">
              <option value="documento">
                Documentado na fonte indicada
              </option>
              <option value="nao_verificado">
                Informação ainda não verificada
              </option>
            </select>
          </label>

          <button
            className="button button-primary"
            type="submit"
            disabled={pending}
          >
            Adicionar e cruzar
          </button>
        </form>
      </details>

      {message ? (
        <p className={`form-message ${state}`}>{message}</p>
      ) : null}

      {network ? (
        <>
          <div className="entity-network-meta">
            <span>
              Atualizado em {formatDate(network.generatedAt)}
            </span>
            <span>
              {network.entities.length} entidade(s) ·{" "}
              {network.relations.length} relação(ões)
            </span>
          </div>

          <p className="network-disclaimer">{network.disclaimer}</p>

          <div className="entity-cards">
            {network.entities.map((entity) => (
              <article className="entity-card" key={entity.id}>
                <div className="entity-card-header">
                  <div>
                    <span>{entityTypeLabel(entity.type)}</span>
                    <h3>{entity.name}</h3>
                  </div>
                  <b
                    className={`verification verification-${entity.verification}`}
                  >
                    {verificationLabel(entity.verification)}
                  </b>
                </div>

                <p className="entity-role">{entity.role}</p>

                {entity.taxId ? (
                  <p>
                    <strong>CNPJ/CPF:</strong> {entity.taxId}
                  </p>
                ) : null}

                {entity.sourceNote ? (
                  <p className="entity-source-note">{entity.sourceNote}</p>
                ) : null}

                {entity.sourceUrl ? (
                  <a
                    className="text-link"
                    href={entity.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir fonte ↗
                  </a>
                ) : null}

                {entity.company ? (
                  <div className="entity-company">
                    <h4>Cadastro empresarial</h4>
                    <dl>
                      <div>
                        <dt>Razão social</dt>
                        <dd>{entity.company.legalName ?? "Não informada"}</dd>
                      </div>
                      <div>
                        <dt>Situação</dt>
                        <dd>{entity.company.status ?? "Não informada"}</dd>
                      </div>
                      <div>
                        <dt>Abertura</dt>
                        <dd>{formatDate(entity.company.openingDate)}</dd>
                      </div>
                      <div>
                        <dt>Atividade</dt>
                        <dd>
                          {entity.company.mainActivity ?? "Não informada"}
                        </dd>
                      </div>
                      <div>
                        <dt>Endereço</dt>
                        <dd>
                          {[
                            entity.company.address,
                            entity.company.municipality,
                            entity.company.state
                          ]
                            .filter(Boolean)
                            .join(" — ") || "Não informado"}
                        </dd>
                      </div>
                    </dl>

                    <p className="company-source-warning">
                      Fonte: {entity.company.source}.{" "}
                      {entity.company.warning}
                    </p>

                    {entity.company.partners.length ? (
                      <details>
                        <summary>
                          Sócios e administradores (
                          {entity.company.partners.length})
                        </summary>
                        <ul>
                          {entity.company.partners.map((partner) => (
                            <li
                              key={`${partner.name}-${partner.qualification ?? ""}`}
                            >
                              <strong>{partner.name}</strong>
                              {partner.qualification
                                ? ` — ${partner.qualification}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : null}

                {entity.payments ? (
                  <div className="entity-payments">
                    <h4>Pagamentos deste parlamentar</h4>
                    <strong>{formatCurrency(entity.payments.total)}</strong>
                    <span>
                      {entity.payments.count} documento(s), de{" "}
                      {formatDate(entity.payments.firstDate)} a{" "}
                      {formatDate(entity.payments.lastDate)}
                    </span>

                    <details>
                      <summary>Ver documentos</summary>
                      <ul>
                        {entity.payments.documents.map((document, index) => (
                          <li
                            key={`${document.documentCode}-${document.documentNumber}-${index}`}
                          >
                            {document.url ? (
                              <a
                                href={document.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {formatDate(document.date)} —{" "}
                                {formatCurrency(document.amount)} ↗
                              </a>
                            ) : (
                              <>
                                {formatDate(document.date)} —{" "}
                                {formatCurrency(document.amount)}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ) : null}

                {entity.origin === "documento_manual" ? (
                  <button
                    type="button"
                    className="entity-remove"
                    disabled={pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remover “${entity.name}” das partes registradas?`
                        )
                      ) {
                        send({ action: "remove", entityId: entity.id });
                      }
                    }}
                  >
                    Remover parte registrada
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          <div className="network-relations">
            <h3>Relações encontradas</h3>

            {network.relations.length ? (
              network.relations.map((relation) => (
                <article key={relation.id}>
                  <div>
                    <b
                      className={`verification verification-${relation.verification}`}
                    >
                      {verificationLabel(relation.verification)}
                    </b>
                    <strong>{relation.label}</strong>
                  </div>

                  <p>
                    <b>
                      {entityNames.get(relation.fromEntityId) ??
                        "Entidade não identificada"}
                    </b>{" "}
                    →{" "}
                    <b>
                      {entityNames.get(relation.toEntityId) ??
                        "Entidade não identificada"}
                    </b>
                  </p>

                  <p>{relation.detail}</p>

                  {relation.sourceUrl ? (
                    <a
                      href={relation.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Conferir fonte ↗
                    </a>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="muted">
                Nenhuma relação além das partes básicas foi confirmada.
              </p>
            )}
          </div>

          <div className="network-bottom-grid">
            <section>
              <h3>Perguntas obrigatórias</h3>
              <ol>
                {network.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </section>

            <section>
              <h3>Limites e fontes pendentes</h3>
              <ul>
                {network.sourceGaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>

              {network.sourceStatus.errors.length ? (
                <details>
                  <summary>Erros ou fontes incompletas</summary>
                  <ul>
                    {network.sourceStatus.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          </div>
        </>
      ) : (
        <div className="enrichment-empty">
          <h3>Nenhuma parte adicional registrada</h3>
          <p>
            Adicione a locadora, proprietária, administradora, pessoa ou
            imóvel exatamente como aparece no documento. O sistema
            enriquecerá cada CNPJ e construirá as relações sem inventar
            vínculos.
          </p>
        </div>
      )}
    </section>
  );
}
