import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/confirm-dialog.js";
import { Quarantine } from "../../components/quarantine.js";
import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
  type Agent,
} from "../../lib/agents.js";
import { listEffectivePermissions } from "../../lib/endpoints.js";
import type { Http } from "../../lib/http.js";
import { useSession } from "../session/session.js";
import { AgentForm } from "./agent-form.js";
import { AgentGrants } from "./grants.js";
import { BUDGET_FIELDS, makeAgentDraft } from "./helpers.js";
import { Denied, Failure, Loading, useLoad, useMutation } from "./state.js";
import "./agents.css";

export function AgentsScreen() {
  const { state, http } = useSession();
  if (state.kind !== "signedIn") return null;
  return (
    <TeamAgents
      key={state.activeTeam.id}
      http={http}
      teamId={state.activeTeam.id}
      teamName={state.activeTeam.name}
    />
  );
}

function TeamAgents({ http, teamId, teamName }: { http: Http; teamId: string; teamName: string }) {
  const { t } = useTranslation();
  const loader = useCallback(() => listEffectivePermissions(http, teamId), [http, teamId]);
  const access = useLoad(loader);
  const [selection, setSelection] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [version, setVersion] = useState(0);
  return (
    <section className="screen agents-screen">
      <h1>{t("nav.agents")}</h1>
      <Quarantine text={`${teamName}\n${teamId}`} origin={t("agents.activeTeam")} />
      {access.state.kind === "loading" && <Loading />}
      {access.state.kind === "error" && (
        <Failure error={access.state.error} retry={access.reload} />
      )}
      {access.state.kind === "ready" && (
        <>
          {creating ? (
            <AgentForm
              key="create"
              http={http}
              teamId={teamId}
              canEdit={access.state.data.permissions.includes("agent.edit")}
              onSave={(input) => createAgent(http, teamId, input)}
              onSaved={({ id }) => {
                setCreating(false);
                setSelection(id);
                setVersion((v) => v + 1);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : selection ? (
            <AgentDetail
              key={selection}
              http={http}
              teamId={teamId}
              agentId={selection}
              permissions={access.state.data.permissions}
              onBack={() => {
                setSelection(null);
                setVersion((v) => v + 1);
              }}
            />
          ) : (
            <>
              {access.state.data.permissions.includes("agent.create") && (
                <div className="agent-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => setCreating(true)}
                  >
                    {t("agents.create")}
                  </button>
                </div>
              )}
              {access.state.data.permissions.includes("agent.use") ? (
                <AgentList key={version} http={http} teamId={teamId} onSelect={setSelection} />
              ) : (
                <Denied permission="agent.use" />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function AgentList({
  http,
  teamId,
  onSelect,
}: {
  http: Http;
  teamId: string;
  onSelect: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const loader = useCallback(() => listAgents(http, teamId), [http, teamId]);
  const result = useLoad(loader);
  if (result.state.kind === "loading") return <Loading />;
  if (result.state.kind === "error")
    return <Failure error={result.state.error} retry={result.reload} />;
  if (result.state.data.agents.length === 0)
    return <p className="agent-notice">{t("agents.empty")}</p>;
  return (
    <div className="agent-table-scroll" tabIndex={0} aria-label={t("agents.list")}>
      <table className="agent-table">
        <caption>{t("agents.list")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("agents.name")}</th>
            <th scope="col">{t("agents.status")}</th>
            <th scope="col">{t("agents.updated")}</th>
            <th scope="col">{t("agents.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {result.state.data.agents.map((agent, index) => (
            <tr key={agent.id}>
              <td>
                <Quarantine text={`${agent.name}\n${agent.id}`} origin={t("agents.agentRecord")} />
              </td>
              <td>{t(`agents.statuses.${knownStatus(agent.status)}`)}</td>
              <td>
                <time dateTime={agent.updated_at}>
                  {formatDate(agent.updated_at, i18n.language)}
                </time>
              </td>
              <td>
                <button type="button" className="button" onClick={() => onSelect(agent.id)}>
                  {t("agents.openAgent", {
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

function AgentDetail({
  http,
  teamId,
  agentId,
  permissions,
  onBack,
}: {
  http: Http;
  teamId: string;
  agentId: string;
  permissions: string[];
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const permitted = permissions.includes("agent.use");
  const loader = useCallback(
    () => (permitted ? getAgent(http, teamId, agentId) : Promise.resolve(null)),
    [http, teamId, agentId, permitted],
  );
  const result = useLoad(loader);
  return (
    <>
      <div className="agent-actions">
        <button type="button" className="button button-quiet" onClick={onBack}>
          {t("agents.back")}
        </button>
      </div>
      {!permitted ? (
        <Denied permission="agent.use" />
      ) : result.state.kind === "loading" ? (
        <Loading />
      ) : result.state.kind === "error" ? (
        <Failure error={result.state.error} retry={result.reload} />
      ) : (
        result.state.data && (
          <AgentRecord
            key={result.state.data.id}
            http={http}
            teamId={teamId}
            initial={result.state.data}
            permissions={permissions}
            onDeleted={onBack}
          />
        )
      )}
    </>
  );
}

function AgentRecord({
  http,
  teamId,
  initial,
  permissions,
  onDeleted,
}: {
  http: Http;
  teamId: string;
  initial: Agent;
  permissions: string[];
  onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [agent, setAgent] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<"archived" | "disabled" | "delete" | null>(null);
  const mutation = useMutation();
  const canEdit = permissions.includes("agent.edit");
  const draft = makeAgentDraft(agent);
  const changeStatus = (status: Agent["status"]) =>
    void mutation.run(
      () => updateAgent(http, teamId, agent.id, { status }),
      (next) => {
        setAgent(next);
        setAction(null);
      },
      status,
    );
  if (editing)
    return (
      <AgentForm
        http={http}
        teamId={teamId}
        agent={agent}
        canEdit={canEdit}
        onSave={(input) => updateAgent(http, teamId, agent.id, input)}
        onSaved={(next) => {
          setAgent(next as Agent);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  return (
    <>
      <h2>{t("agents.detail")}</h2>
      <Quarantine text={`${agent.name}\n${agent.id}`} origin={t("agents.agentRecord")} />
      <dl className="agent-metadata">
        <div>
          <dt>{t("agents.status")}</dt>
          <dd>{t(`agents.statuses.${knownStatus(agent.status)}`)}</dd>
        </div>
        <div>
          <dt>{t("agents.createdAt")}</dt>
          <dd>
            <time dateTime={agent.created_at}>{formatDate(agent.created_at, i18n.language)}</time>
          </dd>
        </div>
        <div>
          <dt>{t("agents.updated")}</dt>
          <dd>
            <time dateTime={agent.updated_at}>{formatDate(agent.updated_at, i18n.language)}</time>
          </dd>
        </div>
      </dl>
      <div className="agent-actions">
        {canEdit && (
          <>
            <button
              type="button"
              className="button button-primary"
              disabled={mutation.busy}
              onClick={() => setEditing(true)}
            >
              {t("agents.edit")}
            </button>
            {agent.status !== "active" && (
              <button
                type="button"
                className="button"
                disabled={mutation.busy}
                onClick={() => changeStatus("active")}
              >
                {t("agents.activate")}
              </button>
            )}
            {agent.status === "active" && (
              <button
                type="button"
                className="button"
                disabled={mutation.busy}
                onClick={() => {
                  mutation.clear();
                  setAction("disabled");
                }}
              >
                {t("agents.disable")}
              </button>
            )}
            {agent.status !== "archived" && (
              <button
                type="button"
                className="button"
                disabled={mutation.busy}
                onClick={() => {
                  mutation.clear();
                  setAction("archived");
                }}
              >
                {t("agents.archive")}
              </button>
            )}
          </>
        )}
        {permissions.includes("agent.delete") && (
          <button
            type="button"
            className="button"
            disabled={mutation.busy}
            onClick={() => {
              mutation.clear();
              setAction("delete");
            }}
          >
            {t("agents.delete")}
          </button>
        )}
      </div>
      {!action && mutation.error && <Failure error={mutation.error} />}
      <h3>{t("agents.model")}</h3>
      {agent.model_id ? (
        <Quarantine text={agent.model_id} origin={t("agents.storedModel")} />
      ) : (
        <p>{t("agents.noModel")}</p>
      )}
      <h3>{t("agents.prompt")}</h3>
      {agent.system_prompt ? (
        <Quarantine text={agent.system_prompt} origin={t("agents.storedPrompt")} />
      ) : (
        <p>{t("agents.noPrompt")}</p>
      )}
      <h3>{t("agents.budgets")}</h3>
      <dl className="agent-metadata">
        {BUDGET_FIELDS.map(({ key }) => (
          <div key={key}>
            <dt>{t(`agents.${key}`)}</dt>
            <dd>{new Intl.NumberFormat(i18n.language).format(Number(draft.budgets[key]))}</dd>
          </div>
        ))}
      </dl>
      <p className="panel-help">{t("agents.effectiveBudgets")}</p>
      {agent.settings && (
        <details>
          <summary>{t("agents.storedSettings")}</summary>
          <Quarantine
            text={JSON.stringify(agent.settings, null, 2)}
            origin={t("agents.storedSettings")}
          />
        </details>
      )}
      {canEdit ? (
        <AgentGrants http={http} teamId={teamId} agentId={agent.id} permissions={permissions} />
      ) : (
        <Denied permission="agent.edit" />
      )}
      <p className="panel-help">{t("agents.runsDeferred")}</p>
      {action && (
        <ConfirmDialog
          title={t(`agents.confirm.${action}`)}
          confirmLabel={t(
            `agents.${action === "archived" ? "archive" : action === "disabled" ? "disable" : "delete"}`,
          )}
          busy={mutation.busy}
          onClose={() => setAction(null)}
          onConfirm={() => {
            if (action === "delete")
              void mutation.run(() => deleteAgent(http, teamId, agent.id), onDeleted, "deleted");
            else changeStatus(action);
          }}
        >
          <Quarantine text={`${agent.name}\n${agent.id}`} origin={t("agents.agentRecord")} />
          <p>{t(action === "delete" ? "agents.deleteHelp" : "agents.statusHelp")}</p>
          {mutation.error && <Failure error={mutation.error} />}
        </ConfirmDialog>
      )}
    </>
  );
}

function knownStatus(status: string): string {
  return ["active", "disabled", "archived"].includes(status) ? status : "unknown";
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
