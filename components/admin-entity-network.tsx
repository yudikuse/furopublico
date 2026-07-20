"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AlertEntityNetwork,
  AlertEntityRelation,
  AlertEntityType,
  AlertManualEntity,
  AlertNetworkEntity,
  EntityVerification
} from "@/lib/types";

type Props = {
  alertId: string;
  network?: AlertEntityNetwork;
  defaultSourceUrl?: string;
};

type ApiResponse = {
  ok: boolean;
  network?: AlertEntityNetwork;
  message?: string;
  error?: string;
};

type ManualForm = {
  name: string;
  type: AlertEntityType;
  taxId: string;
  role: string;
  sourceUrl: string;
  sourceNote: string;
  verification: "documento" | "nao_verificado";
};

const initialForm = (defaultSourceUrl?: string): ManualForm => ({
  name: "",
  type: "empresa",
  taxId: "",
  role: "",
  sourceUrl: defaultSourceUrl ?? "",
  sourceNote: "",
  verification: "documento"
});

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2
  }).format(Number(value ?? 0));
}

function formatDate(value?: string) {
  if (!value) return "Data não informada";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

function cleanTaxId(value?: string) {
  return String(value ?? "").replace(/\D/g, "");
}

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

function entityTypeLabel(value: AlertEntityType) {
  const labels: Record<AlertEntityType, string> = {
    pessoa: "Pessoa",
    empresa: "Empresa",
    imovel: "Imóvel",
    orgao: "Órgão"
  };
  return labels[value];
}

function relationEntityName(
  relationId: string,
  entitiesById: Map<string, AlertNetworkEntity>
) {
  return entitiesById.get(relationId)?.name ?? "Entidade não localizada";
}

export function AdminEntityNetwork({
  alertId,
  network,
  defaultSourceUrl
}: Props) {
  const router = useRouter();
  const [currentNetwork, setCurrentNetwork] = useState(network);
  const [form, setForm] = useState<ManualForm>(() =>
    initialForm(defaultSourceUrl)
  );
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const autoStarted = useRef(false);

  const endpoint = `/api/admin/alerts/${encodeURIComponent(
    alertId
  )}/entity-network`;

  async function send(
    body: Record<string, unknown>,
    options?: { automatic?: boolean }
  ) {
    const automatic = Boolean(options?.automatic);
    automatic ? setAutoLoading(true) : setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok || !payload.network) {
        throw new Error(payload.error ?? "Não foi possível atualizar a rede.");
      }

      setCurrentNetwork(payload.network);
      setMessage(payload.message ?? "Rede atualizada.");
      router.refresh();
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : String(requestError)
      );
      return false;
    } finally {
      automatic ? setAutoLoading(false) : setLoading(false);
    }
  }

  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;

    const key = `furo-publico:entity-network:auto:${alertId}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "started");

    void send({ action: "recalculate" }, { automatic: true }).then((ok) => {
      if (!ok) window.sessionStorage.removeItem(key);
    });
    // A atualização automática deve ocorrer somente uma vez por caso na sessão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  const entities = currentNetwork?.entities ?? [];
  const relations = currentNetwork?.relations ?? [];
  const manualEntities = currentNetwork?.manualEntities ?? [];

  const entitiesById = useMemo(
    () => new Map(entities.map((entity) => [entity.id, entity])),
    [entities]
  );

  const sortedEntities = useMemo(() => {
    const order: Record<AlertEntityType, number> = {
      empresa: 0,
      pessoa: 1,
      orgao: 2,
      imovel: 3
    };

    return entities.slice().sort((left, right) => {
      if (left.origin === "camara" && right.origin !== "camara") return -1;
      if (right.origin === "camara" && left.origin !== "camara") return 1;
      return order[left.type] - order[right.type] ||
        left.name.localeCompare(right.name, "pt-BR");
    });
  }, [entities]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await send({
      action: "add_manual",
      entity: {
        ...form,
        taxId: cleanTaxId(form.taxId)
      }
    });

    if (ok) setForm(initialForm(defaultSourceUrl));
  }

  async function removeManual(entityId: string) {
    if (!window.confirm("Remover esta parte adicional registrada?")) return;
    await send({ action: "remove_manual", entityId });
  }

  const manualIds = new Set(manualEntities.map((item) => item.id));

  return (
    <section className="admin-panel entity-network-panel">
      <div className="entity-network-heading">
        <div>
          <p className="eyebrow">REDE DE ENTIDADES</p>
          <h2>Partes, empresas, sócios e relações</h2>
        </div>
        <button
          type="button"
          className="button button-dark"
          disabled={loading || autoLoading}
          onClick={() => void send({ action: "recalculate" })}
        >
          {loading ? "Recalculando..." : "Recalcular rede"}
        </button>
      </div>

      <p className="admin-warning">
        A rede organiza fatos documentados, cadastros e coincidências. O
        sistema não conclui parentesco, favorecimento ou propriedade por
        sobrenome, endereço comum ou simples participação societária.
      </p>

      {autoLoading ? (
        <div className="network-auto-status" aria-live="polite">
          <strong>Preparando a rede automaticamente...</strong>
          <span>
            Importando fornecedores do caso CEAP, consultando os CNPJs e
            vinculando documentos, pagamentos e quadro societário.
          </span>
        </div>
      ) : null}

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {currentNetwork ? (
        <>
          <div className="network-summary">
            <span>
              Atualizado em {formatDate(currentNetwork.generatedAt)}
            </span>
            <strong>
              {entities.length} entidade(s) · {relations.length} relação(ões)
            </strong>
          </div>

          <p className="muted">{currentNetwork.disclaimer}</p>

          <div className="network-entity-list">
            {sortedEntities.map((entity) => (
              <article className="network-entity-card" key={entity.id}>
                <div className="network-entity-header">
                  <div>
                    <span>{entityTypeLabel(entity.type)}</span>
                    <h3>{entity.name}</h3>
                    <b className={`network-verification verification-${entity.verification}`}>
                      {verificationLabel(entity.verification)}
                    </b>
                  </div>
                  {manualIds.has(entity.id) ? (
                    <button
                      type="button"
                      className="text-button"
                      disabled={loading}
                      onClick={() => void removeManual(entity.id)}
                    >
                      Remover parte registrada
                    </button>
                  ) : null}
                </div>

                <p><strong>{entity.role}</strong></p>
                {entity.taxId ? <p>CNPJ/CPF: {entity.taxId}</p> : null}
                {entity.sourceNote ? <p>{entity.sourceNote}</p> : null}
                {entity.sourceUrl ? (
                  <a href={entity.sourceUrl} target="_blank" rel="noreferrer">
                    Abrir fonte ↗
                  </a>
                ) : null}

                {entity.company ? (
                  <div className="network-company-profile">
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
                        <dd>{entity.company.mainActivity ?? "Não informada"}</dd>
                      </div>
                      <div>
                        <dt>Endereço</dt>
                        <dd>
                          {[
                            entity.company.address,
                            entity.company.municipality,
                            entity.company.state
                          ].filter(Boolean).join(" — ") || "Não informado"}
                        </dd>
                      </div>
                    </dl>
                    <p className="muted">
                      Fonte: {entity.company.source}. {entity.company.warning}
                    </p>

                    {entity.company.partners.length ? (
                      <details>
                        <summary>
                          Sócios e administradores ({entity.company.partners.length})
                        </summary>
                        <ul>
                          {entity.company.partners.map((partner, index) => (
                            <li key={`${partner.name}-${index}`}>
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
                  <div className="network-payments">
                    <h4>Pagamentos deste parlamentar</h4>
                    <strong>{formatCurrency(entity.payments.total)}</strong>
                    <p>
                      {entity.payments.count} documento(s), de {formatDate(entity.payments.firstDate)} a {formatDate(entity.payments.lastDate)}
                    </p>
                    <details>
                      <summary>Ver documentos</summary>
                      <div className="network-payment-list">
                        {entity.payments.documents.map((document, index) => (
                          <div key={`${document.documentCode}-${document.documentNumber}-${index}`}>
                            <span>{formatDate(document.date)}</span>
                            <strong>{document.documentNumber || document.documentCode || "Sem número"}</strong>
                            <b>{formatCurrency(document.amount)}</b>
                            {document.url ? (
                              <a href={document.url} target="_blank" rel="noreferrer">
                                Abrir ↗
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {relations.length ? (
            <section className="network-relations">
              <h3>Relações encontradas</h3>
              {relations.map((relation: AlertEntityRelation) => (
                <article key={relation.id}>
                  <b className={`network-verification verification-${relation.verification}`}>
                    {verificationLabel(relation.verification)}
                  </b>
                  <h4>{relation.label}</h4>
                  <p>
                    <strong>{relationEntityName(relation.fromEntityId, entitiesById)}</strong>
                    {" → "}
                    <strong>{relationEntityName(relation.toEntityId, entitiesById)}</strong>
                  </p>
                  <p>{relation.detail}</p>
                  {relation.sourceUrl ? (
                    <a href={relation.sourceUrl} target="_blank" rel="noreferrer">
                      Conferir fonte ↗
                    </a>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}

          <div className="network-bottom-grid">
            <section>
              <h3>Perguntas obrigatórias</h3>
              <ul>
                {currentNetwork.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Limites e fontes pendentes</h3>
              <ul>
                {currentNetwork.sourceGaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
              {currentNetwork.sourceStatus.errors.length ? (
                <details>
                  <summary>Erros ou fontes incompletas</summary>
                  <ul>
                    {currentNetwork.sourceStatus.errors.map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          </div>
        </>
      ) : !autoLoading ? (
        <div className="empty-state">
          <h3>Rede ainda não calculada</h3>
          <p>A atualização automática será tentada novamente ao recarregar o caso.</p>
        </div>
      ) : null}

      <details className="network-manual-form">
        <summary>Adicionar outra parte encontrada no documento</summary>
        <p className="muted">
          Use somente para uma pessoa, empresa, imóvel ou órgão que apareça no
          documento, mas não tenha vindo nos campos estruturados da CEAP. O
          fornecedor principal já é importado automaticamente.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="network-form-grid">
            <label>
              Nome ou razão social
              <small>
                Para empresa com CNPJ válido, pode ficar vazio: a razão social
                será consultada no cadastro.
              </small>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Nome exatamente como aparece no documento"
              />
            </label>

            <label>
              Tipo
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as AlertEntityType
                  }))
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
              <input
                value={form.taxId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, taxId: event.target.value }))
                }
                placeholder="00.000.000/0000-00"
              />
            </label>
          </div>

          <label>
            Papel no documento
            <input
              required
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({ ...current, role: event.target.value }))
              }
              placeholder="Ex.: locadora, proprietária, administradora, beneficiária"
            />
          </label>

          <label>
            Fonte
            <input
              required
              type="url"
              value={form.sourceUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sourceUrl: event.target.value
                }))
              }
              placeholder="https://..."
            />
          </label>

          <label>
            Trecho ou fundamento
            <small>
              Descreva exatamente onde o papel aparece. Não registre
              interpretação como se fosse fato.
            </small>
            <textarea
              required
              rows={4}
              value={form.sourceNote}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sourceNote: event.target.value
                }))
              }
              placeholder="Ex.: no cabeçalho consta ‘Locadora: Empresa X, CNPJ...’"
            />
          </label>

          <label>
            Grau de verificação
            <select
              value={form.verification}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  verification: event.target.value as ManualForm["verification"]
                }))
              }
            >
              <option value="documento">Documentado na fonte indicada</option>
              <option value="nao_verificado">Ainda não verificado</option>
            </select>
          </label>

          <button
            type="submit"
            className="button button-primary"
            disabled={loading || autoLoading}
          >
            {loading ? "Processando..." : "Adicionar parte e recalcular"}
          </button>
        </form>
      </details>
    </section>
  );
}
