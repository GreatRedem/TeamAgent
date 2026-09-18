import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/confirm-dialog.js";
import { useAnnouncer } from "../../components/live-regions.js";
import { Quarantine } from "../../components/quarantine.js";
import { listEffectivePermissions } from "../../lib/endpoints.js";
import type { Http } from "../../lib/http.js";
import {
  createKnowledgeBase,
  getKnowledgeItem,
  ingestKnowledge,
  listKnowledgeBases,
  listKnowledgeItems,
  setKnowledgeTrust,
  type CreateKnowledgeBaseInput,
  type IngestKnowledgeInput,
  type KnowledgeItemDetail,
  type KnowledgeItemSummary,
} from "../../lib/knowledge.js";
import { useSession } from "../session/session.js";
import {
  completeDetail,
  knowledgeAccess,
  knowledgeDate,
  knowledgeTrust,
  validBase,
  validIngestion,
  type KnowledgeFailure,
} from "./helpers.js";
import {
  canChangeTrust,
  createKnowledgeStore,
  type KnowledgeSnapshot,
  type KnowledgeStore,
} from "./store.js";
import "./knowledge.css";

export function KnowledgeScreen() {
  const { state, http } = useSession();
  if (state.kind !== "signedIn") return null;
  return (
    <TeamKnowledge
      key={`${state.user.id}:${state.activeTeam.id}`}
      http={http}
      teamId={state.activeTeam.id}
      teamName={state.activeTeam.name}
    />
  );
}

function TeamKnowledge({
  http,
  teamId,
  teamName,
}: {
  http: Http;
  teamId: string;
  teamName: string;
}) {
  const store = useMemo(
    () =>
      createKnowledgeStore({
        permissions: () => listEffectivePermissions(http, teamId),
        bases: () => listKnowledgeBases(http, teamId),
        items: (baseId, cursor) => listKnowledgeItems(http, teamId, baseId, cursor),
        detail: (baseId, itemId) => getKnowledgeItem(http, teamId, baseId, itemId),
        create: (input) => createKnowledgeBase(http, teamId, input),
        ingest: (baseId, input) => ingestKnowledge(http, teamId, baseId, input),
        trust: (baseId, itemId, trusted) =>
          setKnowledgeTrust(http, teamId, baseId, itemId, trusted),
      }),
    [http, teamId],
  );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { announce } = useAnnouncer();
  const { t } = useTranslation();
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  useEffect(() => {
    if (state.result)
      announce(
        t(
          typeof state.result === "string"
            ? `knowledge.results.${state.result}`
            : `knowledge.errors.${state.result.key}`,
        ),
      );
  }, [state.result, announce, t]);
  return <KnowledgeView state={state} store={store} teamId={teamId} teamName={teamName} />;
}

export function KnowledgeError({ error }: { error: KnowledgeFailure }) {
  const { t } = useTranslation();
  return (
    <div className={`knowledge-notice${error.key === "denied" ? " knowledge-denied" : ""}`}>
      <p>{t(`knowledge.errors.${error.key}`)}</p>
      <Quarantine
        origin={t("knowledge.requestId")}
        text={error.requestId ?? t("knowledge.noRequestId")}
      />
    </div>
  );
}

export function KnowledgeDate({ value }: { value: string | null }) {
  const { t, i18n } = useTranslation();
  const formatted = knowledgeDate(value, i18n.language);
  return formatted && value ? (
    <time dateTime={value}>{formatted}</time>
  ) : (
    <span>{t("knowledge.unknown")}</span>
  );
}

export function ItemAttribution({ item }: { item: KnowledgeItemSummary }) {
  const { t } = useTranslation();
  return (
    <dl className="knowledge-attribution">
      <div>
        <dt>{t("knowledge.trustLevel")}</dt>
        <dd>{t(`knowledge.trust.${knowledgeTrust(item.trust_level)}`)}</dd>
      </div>
      <div>
        <dt>{t("knowledge.trustedBy")}</dt>
        <dd>
          <Quarantine
            origin={t("knowledge.trustedBy")}
            text={item.trusted_by ?? t("knowledge.unknown")}
          />
        </dd>
      </div>
      <div>
        <dt>{t("knowledge.trustedAt")}</dt>
        <dd>
          <KnowledgeDate value={item.trusted_at} />
        </dd>
      </div>
      <div>
        <dt>{t("knowledge.ingestedFrom")}</dt>
        <dd>
          <Quarantine
            origin={t("knowledge.ingestedFrom")}
            text={item.ingested_from ?? t("knowledge.unknown")}
          />
        </dd>
      </div>
      <div>
        <dt>{t("knowledge.ingestedBy")}</dt>
        <dd>
          <Quarantine
            origin={t("knowledge.ingestedBy")}
            text={item.ingested_by ?? t("knowledge.unknown")}
          />
        </dd>
      </div>
      <div>
        <dt>{t("knowledge.createdAt")}</dt>
        <dd>
          <KnowledgeDate value={item.created_at} />
        </dd>
      </div>
    </dl>
  );
}

export function KnowledgeView({
  state,
  store,
  teamId,
  teamName,
}: {
  state: KnowledgeSnapshot;
  store: KnowledgeStore;
  teamId: string;
  teamName: string;
}) {
  const { t, i18n } = useTranslation();
  const access = knowledgeAccess(state.permissions);
  const blocked =
    state.busy ||
    state.pageLoading ||
    state.detailLoading ||
    !!state.pageError ||
    !!state.detailError ||
    (state.result !== null && typeof state.result !== "string");
  const base = state.bases.find((entry) => entry.id === state.baseId);
  const detail =
    state.baseId && state.itemId && completeDetail(state.detail, state.baseId, state.itemId)
      ? state.detail
      : null;
  return (
    <section className="screen knowledge-screen" aria-busy={state.busy || state.kind === "loading"}>
      <h1>{t("nav.knowledge")}</h1>
      <Quarantine origin={t("knowledge.teamRecord")} text={`${teamName}\n${teamId}`} />
      <p className="panel-help">{t("knowledge.limits")}</p>
      <div className="knowledge-actions">
        <button
          type="button"
          className="button"
          disabled={state.busy || state.kind === "loading"}
          onClick={() => void store.reload()}
        >
          {t("knowledge.reload")}
        </button>
        {state.baseId && (
          <button
            type="button"
            className="button"
            disabled={state.busy}
            onClick={() => void store.selectBase(null)}
          >
            {t("knowledge.back")}
          </button>
        )}
      </div>
      {state.result &&
        (typeof state.result === "string" ? (
          <p>{t(`knowledge.results.${state.result}`)}</p>
        ) : (
          <KnowledgeError error={state.result} />
        ))}
      {state.busy && <p>{t("knowledge.saving")}</p>}
      {state.kind === "loading" ? (
        <p>{t("knowledge.loading")}</p>
      ) : state.kind === "error" ? (
        state.error && <KnowledgeError error={state.error} />
      ) : (
        <>
          {!access.read && (
            <p className="knowledge-notice knowledge-denied">{t("knowledge.deniedRead")}</p>
          )}
          {!access.write && (
            <p className="knowledge-notice knowledge-denied">{t("knowledge.deniedWrite")}</p>
          )}
          {!state.baseId && (
            <>
              {access.write && (
                <BaseForm key={state.revision} blocked={blocked} onSave={store.create} />
              )}
              {access.read && (
                <>
                  <h2>{t("knowledge.bases")}</h2>
                  {state.bases.length === 0 ? (
                    <p>{t("knowledge.emptyBases")}</p>
                  ) : (
                    <div
                      className="knowledge-table-scroll"
                      tabIndex={0}
                      aria-label={t("knowledge.bases")}
                    >
                      <table className="knowledge-table">
                        <caption>{t("knowledge.bases")}</caption>
                        <thead>
                          <tr>
                            <th scope="col">{t("knowledge.baseRecord")}</th>
                            <th scope="col">{t("knowledge.createdAt")}</th>
                            <th scope="col">{t("knowledge.actions")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {state.bases.map((entry, index) => (
                            <tr key={entry.id}>
                              <td>
                                <Quarantine
                                  origin={t("knowledge.baseRecord")}
                                  text={`${entry.name}\n${entry.id}`}
                                />
                                <Quarantine
                                  origin={t("knowledge.description")}
                                  text={entry.description ?? t("knowledge.unknown")}
                                />
                                <Quarantine
                                  origin={t("knowledge.type")}
                                  text={entry.type ?? t("knowledge.unknown")}
                                />
                              </td>
                              <td>
                                <KnowledgeDate value={entry.created_at} />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="button"
                                  disabled={state.busy}
                                  onClick={() => void store.selectBase(entry.id)}
                                >
                                  {t("knowledge.openBase", {
                                    number: new Intl.NumberFormat(i18n.language).format(index + 1),
                                  })}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {access.read && base && (
            <>
              <Quarantine origin={t("knowledge.baseRecord")} text={`${base.name}\n${base.id}`} />
              {access.write && (
                <IngestionForm
                  key={`${base.id}:${state.revision}`}
                  blocked={blocked}
                  onSave={store.ingest}
                />
              )}
              <h2>{t("knowledge.inventory")}</h2>
              {state.pageError && <KnowledgeError error={state.pageError} />}
              {state.items.length === 0 && !state.pageError && <p>{t("knowledge.emptyItems")}</p>}
              {state.items.length > 0 && (
                <div
                  className="knowledge-table-scroll"
                  tabIndex={0}
                  aria-label={t("knowledge.inventory")}
                >
                  <table className="knowledge-table">
                    <caption>{t("knowledge.inventory")}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t("knowledge.itemRecord")}</th>
                        <th scope="col">{t("knowledge.attribution")}</th>
                        <th scope="col">{t("knowledge.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.items.map((item, index) => (
                        <tr key={item.id}>
                          <td>
                            <Quarantine
                              origin={t("knowledge.itemRecord")}
                              text={`${item.title ?? t("knowledge.unknown")}\n${item.id}`}
                            />
                          </td>
                          <td>
                            <ItemAttribution item={item} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button"
                              disabled={state.busy || !!state.pageError}
                              onClick={() => void store.selectItem(item.id)}
                            >
                              {t("knowledge.openItem", {
                                number: new Intl.NumberFormat(i18n.language).format(index + 1),
                              })}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {state.nextCursor && (
                <button
                  type="button"
                  className="button"
                  disabled={state.busy || state.pageLoading}
                  onClick={() => void store.loadMore()}
                >
                  {t("knowledge.loadMore")}
                </button>
              )}
              {state.pageLoading && <p>{t("knowledge.loadingPage")}</p>}
              {state.detailLoading && <p>{t("knowledge.loadingDetail")}</p>}
              {state.detailError && <KnowledgeError error={state.detailError} />}
              {detail && !state.detailLoading && !state.detailError && (
                <KnowledgeDetail
                  key={`${detail.id}:${state.revision}`}
                  item={detail}
                  state={state}
                  store={store}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

export function TrustConfirmation({
  item,
  trusted,
  busy,
  onConfirm,
  onClose,
}: {
  item: KnowledgeItemDetail;
  trusted: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      title={t(trusted ? "knowledge.confirmTrust" : "knowledge.confirmRevoke")}
      confirmLabel={t(trusted ? "knowledge.markTrusted" : "knowledge.revokeTrust")}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <Quarantine
        origin={t("knowledge.itemRecord")}
        text={`${item.title ?? t("knowledge.unknown")}\n${item.id}\n${item.knowledge_base_id}`}
      />
      <ItemAttribution item={item} />
      <p>{t("knowledge.provenanceHelp")}</p>
      <p>{t(trusted ? "knowledge.trustConsequence" : "knowledge.revokeConsequence")}</p>
    </ConfirmDialog>
  );
}

export function KnowledgeDetail({
  item,
  state,
  store,
}: {
  item: KnowledgeItemDetail;
  state: KnowledgeSnapshot;
  store: KnowledgeStore;
}) {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState<{ itemId: string; trusted: boolean } | null>(
    null,
  );
  const trust = knowledgeTrust(item.trust_level);
  const trusted = trust === "untrusted";
  const allowed = canChangeTrust(state, item.id, trusted);
  return (
    <section className="knowledge-detail">
      <h2>{t("knowledge.detail")}</h2>
      <Quarantine
        origin={t("knowledge.itemRecord")}
        text={`${item.title ?? t("knowledge.unknown")}\n${item.id}\n${item.knowledge_base_id}`}
      />
      <div className="knowledge-review">
        <div>
          <Quarantine origin={t("knowledge.content")} text={item.content} />
          <Quarantine
            origin={t("knowledge.metadata")}
            text={
              item.metadata === null
                ? t("knowledge.unknown")
                : JSON.stringify(item.metadata, null, 2)
            }
          />
        </div>
        <div>
          <ItemAttribution item={item} />
          <p className="panel-help">{t("knowledge.provenanceHelp")}</p>
        </div>
      </div>
      <p className="panel-help">{t("knowledge.trustHelp")}</p>
      {trust === "unknown" ? (
        <p className="knowledge-notice knowledge-denied">{t("knowledge.unknownTrust")}</p>
      ) : (
        <button
          type="button"
          className="button"
          disabled={!allowed}
          onClick={() => setConfirmation({ itemId: item.id, trusted })}
        >
          {t(trusted ? "knowledge.markTrusted" : "knowledge.revokeTrust")}
        </button>
      )}
      {confirmation && confirmation.itemId === item.id && (
        <TrustConfirmation
          item={item}
          trusted={confirmation.trusted}
          busy={!canChangeTrust(state, confirmation.itemId, confirmation.trusted)}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            void store.trust(confirmation.itemId, confirmation.trusted);
          }}
        />
      )}
    </section>
  );
}

function Field({
  name,
  value,
  onChange,
  limit,
  required = false,
  multiline = false,
}: {
  name: "name" | "description" | "title" | "content" | "ingestedFrom";
  value: string;
  onChange: (value: string) => void;
  limit: number;
  required?: boolean;
  multiline?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  const valid = () =>
    value.length <= limit &&
    (!required || (name === "content" ? value.length > 0 : value.trim().length > 0)) &&
    (value === "" || name === "content" || name === "description" || value.trim().length > 0);
  const props = {
    id,
    name,
    value,
    required,
    maxLength: limit,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? `${id}-error` : undefined,
    onBlur: () => setInvalid(!valid()),
    onInvalid: () => setInvalid(true),
    onChange: (event: { target: { value: string } }) => {
      setInvalid(false);
      onChange(event.target.value);
    },
  };
  return (
    <>
      <label htmlFor={id}>{t(`knowledge.${name}`)}</label>
      {multiline ? (
        <textarea {...props} rows={name === "content" ? 10 : 3} />
      ) : (
        <input {...props} pattern={required ? ".*\\S.*" : "(?:.*\\S.*)?"} />
      )}
      {invalid && (
        <p id={`${id}-error`} className="knowledge-notice">
          {t("knowledge.fieldInvalid", {
            limit: new Intl.NumberFormat(i18n.language).format(limit),
          })}
        </p>
      )}
      <Quarantine origin={t("knowledge.draft", { field: t(`knowledge.${name}`) })} text={value} />
    </>
  );
}

export function BaseForm({
  blocked,
  onSave,
}: {
  blocked: boolean;
  onSave: (input: CreateKnowledgeBaseInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <form
      className="knowledge-form"
      onSubmit={(event) => {
        event.preventDefault();
        const input = { name, description: description || undefined };
        if (!blocked && validBase(input)) void onSave(input);
      }}
    >
      <h2>{t("knowledge.createBase")}</h2>
      <fieldset disabled={blocked}>
        <Field name="name" value={name} onChange={setName} required limit={200} />
        <Field
          name="description"
          value={description}
          onChange={setDescription}
          limit={2000}
          multiline
        />
        <button className="button">{t("knowledge.createBase")}</button>
      </fieldset>
    </form>
  );
}

export function IngestionForm({
  blocked,
  onSave,
}: {
  blocked: boolean;
  onSave: (input: IngestKnowledgeInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  return (
    <form
      className="knowledge-form"
      onSubmit={(event) => {
        event.preventDefault();
        const input = { title: title || undefined, content, ingested_from: source || undefined };
        if (!blocked && validIngestion(input)) void onSave(input);
      }}
    >
      <h2>{t("knowledge.ingest")}</h2>
      <p className="panel-help">{t("knowledge.ingestionHelp")}</p>
      <fieldset disabled={blocked}>
        <Field name="title" value={title} onChange={setTitle} limit={500} />
        <Field
          name="content"
          value={content}
          onChange={setContent}
          required
          limit={100_000}
          multiline
        />
        <Field name="ingestedFrom" value={source} onChange={setSource} limit={2000} />
        <p className="panel-help">{t("knowledge.provenanceHelp")}</p>
        <button className="button">{t("knowledge.ingest")}</button>
      </fieldset>
    </form>
  );
}
