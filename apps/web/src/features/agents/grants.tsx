import { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/confirm-dialog.js";
import { Quarantine } from "../../components/quarantine.js";
import {
  getGrants,
  listGrantResources,
  listSourceConnections,
  replaceIds,
  replaceSources,
  type Connection,
  type Grants,
  type IdGrantKind,
  type SourceGrant,
} from "../../lib/agents.js";
import type { Http } from "../../lib/http.js";
import {
  mergeGrantedResources,
  newSourceGrant,
  sourceRemovals,
  validDestination,
  validSourceGrants,
} from "./helpers.js";
import { Denied, Failure, Loading, useLoad, useMutation } from "./state.js";

interface Scope {
  http: Http;
  teamId: string;
  agentId: string;
  permissions: string[];
}
const ID_FIELDS = {
  permissions: "permission_ids",
  tools: "tool_ids",
  "knowledge-bases": "knowledge_base_ids",
} as const;
const READ_PERMISSIONS = {
  permissions: "agent.edit",
  tools: "tool.execute",
  "knowledge-bases": "knowledge.read",
} as const;

export function AgentGrants(props: Scope) {
  const { t } = useTranslation();
  const loader = useCallback(
    () => getGrants(props.http, props.teamId, props.agentId),
    [props.http, props.teamId, props.agentId],
  );
  const grants = useLoad(loader);
  const [sourcePresent, setSourcePresent] = useState<boolean | null>(null);
  if (grants.state.kind === "loading") return <Loading />;
  if (grants.state.kind === "error")
    return <Failure error={grants.state.error} retry={grants.reload} />;
  const initial = grants.state.data;
  return (
    <section className="agent-grants">
      <h2>{t("agents.grants")}</h2>
      <p className="panel-help">{t("agents.panelSaves")}</p>
      {(["permissions", "tools", "knowledge-bases"] as const).map((kind) => (
        <IdPanel
          key={kind}
          {...props}
          kind={kind}
          initial={initial[ID_FIELDS[kind]]}
          sourcePresent={sourcePresent ?? initial.sources.length > 0}
        />
      ))}
      <SourcesPanel
        {...props}
        initial={initial.sources}
        onSaved={(sources) => setSourcePresent(sources.length > 0)}
      />
    </section>
  );
}

function RemovalDialog({
  removed,
  busy,
  error,
  onConfirm,
  onClose,
  sources = false,
}: {
  removed: string[];
  busy: boolean;
  error: ReturnType<typeof useMutation>["error"];
  onConfirm: () => void;
  onClose: () => void;
  sources?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      title={t("agents.confirmRemoval")}
      confirmLabel={t("agents.saveRemovals")}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <p>{t("agents.removalHelp")}</p>
      {sources && <p>{t("agents.workflowWarning")}</p>}
      <Quarantine origin={t("agents.removedValues")} text={removed.join("\n")} />
      {error && <Failure error={error} />}
    </ConfirmDialog>
  );
}

function IdPanel({
  http,
  teamId,
  agentId,
  permissions,
  kind,
  initial,
  sourcePresent,
}: Scope & { kind: IdGrantKind; initial: string[]; sourcePresent: boolean }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const permitted = permissions.includes(READ_PERMISSIONS[kind]);
  const loader = useCallback(
    () => (permitted ? listGrantResources(http, teamId, kind) : Promise.resolve(null)),
    [http, teamId, kind, permitted],
  );
  const catalog = useLoad(loader);
  const [saved, setSaved] = useState(initial);
  const [selected, setSelected] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const mutation = useMutation();
  const ready = permitted && catalog.state.kind === "ready";
  const resources = catalog.state.kind === "ready" ? (catalog.state.data ?? []) : [];
  const rows = mergeGrantedResources(resources, [...saved, ...selected]);
  const removed = saved.filter((value) => !selected.includes(value));
  const changed =
    saved.length !== selected.length || saved.some((value) => !selected.includes(value));
  const save = () => {
    if (!ready || !changed || selected.length > 200) return;
    void mutation.run(
      () => replaceIds(http, teamId, agentId, kind, selected),
      (result: Grants) => {
        setSaved(result[ID_FIELDS[kind]]);
        setSelected(result[ID_FIELDS[kind]]);
        setConfirm(false);
      },
    );
  };
  return (
    <section className="agent-grant-panel" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{t(`agents.${kind}`)}</h3>
      {kind === "permissions" && <p className="agent-notice">{t("agents.writeWarning")}</p>}
      {kind === "knowledge-bases" && (
        <p className={sourcePresent ? "agent-notice" : "panel-help"}>
          {t(sourcePresent ? "agents.knowledgeWarning" : "agents.knowledgeHelp")}
        </p>
      )}
      {!permitted && <Denied permission={READ_PERMISSIONS[kind]} />}
      {catalog.state.kind === "loading" && <Loading />}
      {catalog.state.kind === "error" && (
        <Failure error={catalog.state.error} retry={catalog.reload} />
      )}
      {ready && resources.length === 0 && <p>{t("agents.emptyCatalog")}</p>}
      {selected.length === 0 && <p>{t("agents.noGrants")}</p>}
      <fieldset disabled={!ready || mutation.busy}>
        <legend className="visually-hidden">{t(`agents.${kind}`)}</legend>
        {rows.map((resource, index) => (
          <div className="agent-resource" key={resource.id}>
            <Quarantine
              id={`${id}-${index}`}
              origin={t(`agents.${kind}`)}
              text={[resource.name, resource.description, resource.id].filter(Boolean).join("\n")}
            />
            {resource.risk_tier && (
              <p className="panel-help">
                {t("agents.riskTier")}:{" "}
                {t(
                  `agents.tier.${["read_only", "reply", "write", "admin"].includes(resource.risk_tier) ? resource.risk_tier : "unknown"}`,
                )}
              </p>
            )}
            {!resources.some((item) => item.id === resource.id) && (
              <p className="panel-help">{t("agents.unavailablePreserved")}</p>
            )}
            <label className="agent-check">
              <input
                type="checkbox"
                checked={selected.includes(resource.id)}
                aria-describedby={`${id}-${index}`}
                onChange={(event) => {
                  mutation.clear();
                  setSelected(
                    event.target.checked
                      ? [...selected, resource.id]
                      : selected.filter((value) => value !== resource.id),
                  );
                }}
              />
              {t("agents.grantResource", {
                number: new Intl.NumberFormat(i18n.language).format(index + 1),
              })}
            </label>
          </div>
        ))}
      </fieldset>
      {selected.length > 200 && <p className="field-error">{t("agents.grantLimit")}</p>}
      {!confirm && mutation.error && <Failure error={mutation.error} />}
      {mutation.saved && <p>{t("agents.panelSaved", { panel: t(`agents.${kind}`) })}</p>}
      <button
        className="button"
        type="button"
        disabled={!ready || mutation.busy || !changed || selected.length > 200}
        onClick={() => (removed.length > 0 ? setConfirm(true) : save())}
      >
        {t(mutation.busy ? "agents.saving" : "agents.savePanel", { panel: t(`agents.${kind}`) })}
      </button>
      {confirm && (
        <RemovalDialog
          removed={removed}
          busy={mutation.busy}
          error={mutation.error}
          onConfirm={save}
          onClose={() => setConfirm(false)}
        />
      )}
    </section>
  );
}

function SourcesPanel({
  http,
  teamId,
  agentId,
  permissions,
  initial,
  onSaved,
}: Scope & { initial: SourceGrant[]; onSaved: (sources: SourceGrant[]) => void }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const permitted = permissions.includes("source.read");
  const loader = useCallback(
    () => (permitted ? listSourceConnections(http, teamId) : Promise.resolve(null)),
    [http, teamId, permitted],
  );
  const catalog = useLoad(loader);
  const [saved, setSaved] = useState(initial);
  const [selected, setSelected] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const mutation = useMutation();
  const ready = permitted && catalog.state.kind === "ready";
  const connections = catalog.state.kind === "ready" ? (catalog.state.data ?? []) : [];
  const rows = mergeGrantedResources(
    connections,
    [...saved, ...selected].map((g) => g.source_connection_id),
  );
  const removed = sourceRemovals(saved, selected);
  const changed = JSON.stringify(saved) !== JSON.stringify(selected);
  const update = (next: SourceGrant[]) => {
    mutation.clear();
    setInvalid(false);
    setSelected(next);
  };
  const save = () => {
    if (!ready || !changed) return;
    if (!validSourceGrants(selected)) {
      setInvalid(true);
      return;
    }
    void mutation.run(
      () => replaceSources(http, teamId, agentId, selected),
      (result) => {
        setSaved(result.sources);
        setSelected(result.sources);
        setConfirm(false);
        onSaved(result.sources);
      },
    );
  };
  return (
    <section className="agent-grant-panel" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{t("agents.sources")}</h3>
      <p className="panel-help">{t("agents.sourcesHelp")}</p>
      {!permitted && <Denied permission="source.read" />}
      {catalog.state.kind === "loading" && <Loading />}
      {catalog.state.kind === "error" && (
        <Failure error={catalog.state.error} retry={catalog.reload} />
      )}
      {ready && connections.length === 0 && <p>{t("agents.noConnections")}</p>}
      {selected.length === 0 && <p>{t("agents.noGrants")}</p>}
      <fieldset disabled={!ready || mutation.busy}>
        <legend className="visually-hidden">{t("agents.sources")}</legend>
        {rows.map((resource, index) => {
          const connection = connections.find((c) => c.id === resource.id);
          const grant = selected.find((g) => g.source_connection_id === resource.id);
          return (
            <div className="agent-resource" key={resource.id}>
              <Quarantine
                id={`${id}-${index}`}
                origin={t("agents.sourceConnection")}
                text={connection ? connectionText(connection) : resource.id}
              />
              {!connection && <p className="panel-help">{t("agents.unavailablePreserved")}</p>}
              <label className="agent-check">
                <input
                  type="checkbox"
                  checked={!!grant}
                  aria-describedby={`${id}-${index}`}
                  onChange={(event) =>
                    update(
                      event.target.checked
                        ? [...selected, newSourceGrant(resource.id)]
                        : selected.filter((g) => g.source_connection_id !== resource.id),
                    )
                  }
                />
                {t("agents.grantResource", {
                  number: new Intl.NumberFormat(i18n.language).format(index + 1),
                })}
              </label>
              {grant && (
                <SourceEditor
                  grant={grant}
                  invalid={invalid}
                  onChange={(next) =>
                    update(selected.map((g) => (g.source_connection_id === resource.id ? next : g)))
                  }
                />
              )}
            </div>
          );
        })}
      </fieldset>
      {invalid && <p className="field-error">{t("agents.errors.sources")}</p>}
      {!confirm && mutation.error && <Failure error={mutation.error} />}
      {mutation.saved && <p>{t("agents.panelSaved", { panel: t("agents.sources") })}</p>}
      <button
        type="button"
        className="button"
        disabled={!ready || mutation.busy || !changed}
        onClick={() => {
          if (!validSourceGrants(selected)) {
            setInvalid(true);
            return;
          }
          if (removed.length > 0) setConfirm(true);
          else save();
        }}
      >
        {t(mutation.busy ? "agents.saving" : "agents.savePanel", { panel: t("agents.sources") })}
      </button>
      {confirm && (
        <RemovalDialog
          sources
          removed={removed}
          busy={mutation.busy}
          error={mutation.error}
          onConfirm={save}
          onClose={() => setConfirm(false)}
        />
      )}
    </section>
  );
}

function connectionText(connection: Connection): string {
  return [
    connection.source.name,
    connection.source.kind,
    connection.name,
    connection.owner_scope,
    connection.status,
    connection.id,
  ].join("\n");
}

function SourceEditor({
  grant,
  invalid,
  onChange,
}: {
  grant: SourceGrant;
  invalid: boolean;
  onChange: (grant: SourceGrant) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [destination, setDestination] = useState("");
  const [badDestination, setBadDestination] = useState(false);
  const [remove, setRemove] = useState<string | null>(null);
  const add = () => {
    if (
      !validDestination(destination) ||
      grant.allowed_destinations.includes(destination) ||
      grant.allowed_destinations.length >= 200
    ) {
      setBadDestination(true);
      return;
    }
    onChange({ ...grant, allowed_destinations: [...grant.allowed_destinations, destination] });
    setDestination("");
    setBadDestination(false);
  };
  return (
    <div className="agent-source-editor">
      <label className="agent-check">
        <input
          type="checkbox"
          checked={grant.can_reply}
          onChange={(event) => onChange({ ...grant, can_reply: event.target.checked })}
        />
        {t("agents.canReply")}
      </label>
      <label className="agent-check">
        <input
          type="checkbox"
          checked={grant.can_initiate}
          onChange={(event) => onChange({ ...grant, can_initiate: event.target.checked })}
        />
        {t("agents.canInitiate")}
      </label>
      <p className="panel-help">{t("agents.exactDestinations")}</p>
      {grant.allowed_destinations.length === 0 && <p>{t("agents.noDestinations")}</p>}
      {grant.allowed_destinations.map((value) => (
        <div className="agent-destination" key={value}>
          <Quarantine text={value} origin={t("agents.destination")} />
          <button
            type="button"
            className="button button-quiet"
            disabled={!grant.can_initiate}
            onClick={() => setRemove(value)}
          >
            {t("agents.removeDestination")}
          </button>
        </div>
      ))}
      <label htmlFor={id}>{t("agents.destination")}</label>
      <div className="agent-actions">
        <input
          id={id}
          value={destination}
          disabled={!grant.can_initiate}
          maxLength={500}
          aria-invalid={badDestination || undefined}
          aria-describedby={`${id}-help`}
          onChange={(event) => {
            setDestination(event.target.value);
            setBadDestination(false);
          }}
          onBlur={() => {
            if (destination !== "")
              setBadDestination(
                !validDestination(destination) || grant.allowed_destinations.includes(destination),
              );
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="button" disabled={!grant.can_initiate} onClick={add}>
          {t("agents.addDestination")}
        </button>
      </div>
      <p id={`${id}-help`} className={badDestination ? "field-error" : "panel-help"}>
        {t(badDestination ? "agents.errors.destination" : "agents.destinationHelp")}
      </p>
      {destination !== "" && (
        <Quarantine text={destination} origin={t("agents.draftDestination")} />
      )}
      {grant.can_initiate && grant.allowed_destinations.length === 0 && (
        <p className={invalid ? "field-error" : "panel-help"}>{t("agents.errors.allowlist")}</p>
      )}
      {remove !== null && (
        <ConfirmDialog
          title={t("agents.removeDestination")}
          confirmLabel={t("agents.removeDestination")}
          busy={false}
          onConfirm={() => {
            onChange({
              ...grant,
              allowed_destinations: grant.allowed_destinations.filter((d) => d !== remove),
            });
            setRemove(null);
          }}
          onClose={() => setRemove(null)}
        >
          <p>{t("agents.workflowWarning")}</p>
          <p>{t("agents.draftRemoval")}</p>
          <Quarantine text={remove} origin={t("agents.destination")} />
        </ConfirmDialog>
      )}
    </div>
  );
}
