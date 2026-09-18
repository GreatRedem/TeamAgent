import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/confirm-dialog.js";
import { useAnnouncer } from "../../components/live-regions.js";
import { Quarantine } from "../../components/quarantine.js";
import { listEffectivePermissions } from "../../lib/endpoints.js";
import type { Http } from "../../lib/http.js";
import {
  createConnection,
  createSource,
  getSource,
  listConnections,
  listSources,
  removeConnection,
  updateSource,
  type Source,
  type SourceConnection,
  type UpdateSourceInput,
} from "../../lib/sources.js";
import { useSession } from "../session/session.js";
import {
  sourceAccess,
  sourceDate,
  sourceStatus,
  validSourceText,
  type SourceFailure,
} from "./helpers.js";
import { createSourcesStore, type SourcesSnapshot, type SourcesStore } from "./store.js";
import "./sources.css";

export function SourcesScreen() {
  const { state, http } = useSession();
  if (state.kind !== "signedIn") return null;
  return (
    <TeamSources
      key={`${state.user.id}:${state.activeTeam.id}`}
      http={http}
      teamId={state.activeTeam.id}
      teamName={state.activeTeam.name}
    />
  );
}

function TeamSources({ http, teamId, teamName }: { http: Http; teamId: string; teamName: string }) {
  const store = useMemo(
    () =>
      createSourcesStore({
        permissions: () => listEffectivePermissions(http, teamId),
        list: () => listSources(http, teamId),
        get: (id) => getSource(http, teamId, id),
        connections: (id) => listConnections(http, teamId, id),
        create: (input) => createSource(http, teamId, input),
        update: (id, input) => updateSource(http, teamId, id, input),
        connect: (id, name) => createConnection(http, teamId, id, name),
        disconnect: (id, connectionId) => removeConnection(http, teamId, id, connectionId),
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
            ? `sources.${state.result}`
            : `sources.errors.${state.result.key}`,
        ),
      );
  }, [state.result, announce, t]);
  return <SourcesView state={state} store={store} teamName={teamName} teamId={teamId} />;
}

export function SourceError({ error }: { error: SourceFailure }) {
  const { t } = useTranslation();
  return (
    <div className={`source-notice${error.denied ? " source-denied" : ""}`}>
      <p>{t(`sources.errors.${error.key}`)}</p>
      <Quarantine
        origin={t("sources.requestId")}
        text={error.requestId ?? t("sources.noRequestId")}
      />
    </div>
  );
}

function Denied({
  permission,
}: {
  permission: "source.read" | "source.connect" | "source.disconnect";
}) {
  const { t } = useTranslation();
  return <p className="source-notice source-denied">{t("sources.denied", { permission })}</p>;
}

export function SourcesView({
  state,
  store,
  teamId,
  teamName,
}: {
  state: SourcesSnapshot;
  store: SourcesStore;
  teamId: string;
  teamName: string;
}) {
  const { t } = useTranslation();
  const access = sourceAccess(state.permissions);
  const blocked = state.busy || (state.result !== null && typeof state.result !== "string");
  return (
    <section className="screen sources-screen" aria-busy={state.busy || state.kind === "loading"}>
      <h1>{t("nav.sources")}</h1>
      <Quarantine origin={t("sources.teamRecord")} text={`${teamName}\n${teamId}`} />
      <p className="panel-help">{t("sources.registryOnly")}</p>
      <p className="panel-help">{t("sources.limits")}</p>
      <div className="source-actions">
        <button
          type="button"
          className="button"
          disabled={state.busy || state.kind === "loading"}
          onClick={() => void store.reload()}
        >
          {t("sources.reload")}
        </button>
        {state.selection && (
          <button
            type="button"
            className="button button-quiet"
            disabled={state.busy}
            onClick={() => void store.select(null)}
          >
            {t("sources.back")}
          </button>
        )}
      </div>
      {state.result &&
        (typeof state.result === "string" ? (
          <p>{t(`sources.${state.result}`)}</p>
        ) : (
          <SourceError error={state.result} />
        ))}
      {state.busy && <p>{t("sources.saving")}</p>}
      {state.kind === "loading" ? (
        <p>{t("sources.loading")}</p>
      ) : state.kind === "error" ? (
        state.error && <SourceError error={state.error} />
      ) : (
        <>
          {!access.read && <Denied permission="source.read" />}
          {!access.connect && <Denied permission="source.connect" />}
          {state.source ? (
            <SourceDetail
              key={`${state.source.id}:${state.revision}`}
              source={state.source}
              connections={state.connections}
              store={store}
              access={access}
              blocked={blocked}
            />
          ) : (
            <>
              {access.connect && (
                <SourceForm
                  key={state.revision}
                  blocked={blocked}
                  onSave={(input) => store.create({ type: input.type, name: input.name })}
                />
              )}
              {access.read && (
                <SourceList
                  sources={state.sources}
                  onSelect={(id) => void store.select(id)}
                  blocked={blocked}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

export function SourceDate({ value }: { value: string }) {
  const { t, i18n } = useTranslation();
  const formatted = sourceDate(value, i18n.language);
  return formatted ? (
    <time dateTime={value}>{formatted}</time>
  ) : (
    <span>{t("sources.unavailableDate")}</span>
  );
}

export function SourceList({
  sources,
  onSelect,
  blocked,
}: {
  sources: Source[];
  onSelect: (id: string) => void;
  blocked: boolean;
}) {
  const { t, i18n } = useTranslation();
  if (sources.length === 0) return <p className="source-notice">{t("sources.empty")}</p>;
  return (
    <div className="source-table-scroll" tabIndex={0} aria-label={t("sources.list")}>
      <table className="source-table">
        <caption>{t("sources.list")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("sources.record")}</th>
            <th scope="col">{t("sources.status")}</th>
            <th scope="col">{t("sources.createdAt")}</th>
            <th scope="col">{t("sources.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source, index) => (
            <tr key={source.id}>
              <td>
                <Quarantine
                  origin={t("sources.sourceRecord")}
                  text={`${source.name}\n${source.kind}\n${source.id}`}
                />
              </td>
              <td>{t(`sources.statuses.${sourceStatus(source.status)}`)}</td>
              <td>
                <SourceDate value={source.created_at} />
              </td>
              <td>
                <button
                  type="button"
                  className="button"
                  disabled={blocked}
                  onClick={() => onSelect(source.id)}
                >
                  {t("sources.open", {
                    number: new Intl.NumberFormat(i18n.language).format(index + 1),
                  })}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SourceDetail({
  source,
  connections,
  store,
  access,
  blocked,
}: {
  source: Source;
  connections: SourceConnection[];
  store: SourcesStore;
  access: ReturnType<typeof sourceAccess>;
  blocked: boolean;
}) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState<SourceConnection | null>(null);
  return (
    <>
      <h2>{t("sources.detail")}</h2>
      <Quarantine
        origin={t("sources.sourceRecord")}
        text={`${source.name}\n${source.kind}\n${source.id}`}
      />
      <dl className="source-metadata">
        <div>
          <dt>{t("sources.status")}</dt>
          <dd>{t(`sources.statuses.${sourceStatus(source.status)}`)}</dd>
        </div>
        <div>
          <dt>{t("sources.createdAt")}</dt>
          <dd>
            <SourceDate value={source.created_at} />
          </dd>
        </div>
        <div>
          <dt>{t("sources.webhook")}</dt>
          <dd>{t(source.has_webhook ? "sources.webhookPresent" : "sources.webhookAbsent")}</dd>
        </div>
      </dl>
      {access.connect && (
        <SourceForm
          source={source}
          blocked={blocked}
          onSave={(input) => store.save({ name: input.name, status: input.status })}
        />
      )}
      <h2>{t("sources.connections")}</h2>
      <p className="panel-help">{t("sources.teamOnly")}</p>
      <p className="panel-help">{t("sources.connectionStatusHelp")}</p>
      {access.connect && <ConnectionForm blocked={blocked} onSave={store.connect} />}
      {!access.disconnect && <Denied permission="source.disconnect" />}
      <ConnectionList
        connections={connections}
        canRemove={access.disconnect}
        blocked={blocked}
        onRemove={setRemoving}
      />
      {removing && (
        <ConfirmDialog
          title={t("sources.confirmRemove")}
          confirmLabel={t("sources.remove")}
          busy={blocked}
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            void store.remove(removing.id);
          }}
        >
          <Quarantine origin={t("sources.sourceRecord")} text={`${source.name}\n${source.id}`} />
          <Quarantine
            origin={t("sources.connectionRecord")}
            text={`${removing.name}\n${removing.id}`}
          />
          <p>{t("sources.removeHelp")}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

export function ConnectionList({
  connections,
  canRemove,
  blocked,
  onRemove,
}: {
  connections: SourceConnection[];
  canRemove: boolean;
  blocked: boolean;
  onRemove: (connection: SourceConnection) => void;
}) {
  const { t, i18n } = useTranslation();
  if (connections.length === 0)
    return <p className="source-notice">{t("sources.noConnections")}</p>;
  return (
    <div className="source-table-scroll" tabIndex={0} aria-label={t("sources.connections")}>
      <table className="source-table">
        <caption>{t("sources.connections")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("sources.record")}</th>
            <th scope="col">{t("sources.owner")}</th>
            <th scope="col">{t("sources.createdAt")}</th>
            <th scope="col">{t("sources.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {connections.map((connection, index) => (
            <tr key={connection.id}>
              <td>
                <Quarantine
                  origin={t("sources.connectionRecord")}
                  text={`${connection.name}\n${connection.id}`}
                />
                <Quarantine origin={t("sources.storedConnectionStatus")} text={connection.status} />
              </td>
              <td>
                {t(
                  `sources.owners.${connection.owner_scope === "team" || connection.owner_scope === "user" ? connection.owner_scope : "unknown"}`,
                )}
              </td>
              <td>
                <SourceDate value={connection.created_at} />
              </td>
              <td>
                {canRemove && (
                  <button
                    type="button"
                    className="button"
                    disabled={blocked}
                    onClick={() => onRemove(connection)}
                  >
                    {t("sources.removeNumber", {
                      number: new Intl.NumberFormat(i18n.language).format(index + 1),
                    })}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextField({
  name,
  limit,
  value,
  setValue,
}: {
  name: "name" | "type";
  limit: number;
  value: string;
  setValue: (value: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  return (
    <>
      <label htmlFor={id}>{t(`sources.${name}`)}</label>
      <input
        id={id}
        name={name}
        value={value}
        required
        maxLength={limit}
        pattern=".*\S.*"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onBlur={() => setInvalid(!validSourceText(value, limit))}
        onInvalid={() => setInvalid(true)}
        onChange={(event) => {
          setInvalid(false);
          setValue(event.target.value);
        }}
      />
      {invalid && (
        <p id={`${id}-error`} className="source-notice">
          {t(`sources.errors.${name === "name" ? "name" : "type"}`)}
        </p>
      )}
      <Quarantine origin={t(`sources.draft.${name}`)} text={value} />
    </>
  );
}

export function SourceForm({
  source,
  blocked,
  onSave,
}: {
  source?: Source;
  blocked: boolean;
  onSave: (input: UpdateSourceInput & { type: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(source?.name ?? "");
  const [type, setType] = useState("");
  const [status, setStatus] = useState<UpdateSourceInput["status"]>(
    source?.status === "disabled" ? "disabled" : "active",
  );
  return (
    <form
      className="source-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked && validSourceText(name) && (source || validSourceText(type, 100)))
          void onSave({ name, type, status });
      }}
    >
      <h2>{t(source ? "sources.edit" : "sources.create")}</h2>
      <fieldset disabled={blocked}>
        <TextField name="name" limit={200} value={name} setValue={setName} />
        {!source && <TextField name="type" limit={100} value={type} setValue={setType} />}
        {source && (
          <>
            <label htmlFor={id}>{t("sources.status")}</label>
            <select
              id={id}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value === "disabled" ? "disabled" : "active")
              }
            >
              <option value="active">{t("sources.statuses.active")}</option>
              <option value="disabled">{t("sources.statuses.disabled")}</option>
            </select>
            <p className="panel-help">{t("sources.statusHelp")}</p>
          </>
        )}
        <button className="button button-primary">
          {t(source ? "sources.save" : "sources.create")}
        </button>
      </fieldset>
    </form>
  );
}

export function ConnectionForm({
  blocked,
  onSave,
}: {
  blocked: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  return (
    <form
      className="source-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked && validSourceText(name)) void onSave(name);
      }}
    >
      <h3>{t("sources.createConnection")}</h3>
      <fieldset disabled={blocked}>
        <TextField name="name" limit={200} value={name} setValue={setName} />
        <button className="button">{t("sources.createConnection")}</button>
      </fieldset>
    </form>
  );
}
