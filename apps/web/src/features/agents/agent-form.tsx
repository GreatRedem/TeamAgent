import { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Quarantine } from "../../components/quarantine.js";
import { getAgentCatalogs, type Agent, type AgentInput } from "../../lib/agents.js";
import type { Http } from "../../lib/http.js";
import {
  agentInput,
  BUDGET_FIELDS,
  makeAgentDraft,
  validAgentDraft,
  type AgentDraft,
} from "./helpers.js";
import { Denied, Failure, Loading, useLoad, useMutation } from "./state.js";

export function AgentForm({
  http,
  teamId,
  agent,
  canEdit,
  onSave,
  onSaved,
  onCancel,
}: {
  http: Http;
  teamId: string;
  agent?: Agent;
  canEdit: boolean;
  onSave: (input: AgentInput) => Promise<{ id: string }>;
  onSaved: (result: { id: string }) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState<AgentDraft>(() => makeAgentDraft(agent));
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const mutation = useMutation();
  const loader = useCallback(
    () => (canEdit ? getAgentCatalogs(http, teamId) : Promise.resolve(null)),
    [http, teamId, canEdit],
  );
  const catalog = useLoad(loader);
  const blocked = mutation.busy || catalog.state.kind !== "ready";
  const models = catalog.state.kind === "ready" ? (catalog.state.data?.models ?? []) : [];
  const touch = (element: HTMLInputElement | HTMLTextAreaElement) => {
    const valid =
      element.validity.valid && (element.name !== "name" || element.value.trim().length > 0);
    setInvalid((old) => ({ ...old, [element.name]: !valid }));
  };
  const clear = (name: string) => {
    setInvalid((old) => ({ ...old, [name]: false }));
    mutation.clear();
  };
  return (
    <form
      className="agent-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked) return;
        if (!validAgentDraft(draft)) {
          const name = event.currentTarget.elements.namedItem("name") as HTMLInputElement;
          touch(name);
          name.focus();
          return;
        }
        void mutation.run(
          () => onSave(agentInput(draft, agent)),
          onSaved,
          agent ? "saved" : "created",
        );
      }}
    >
      <h2>{t(agent ? "agents.edit" : "agents.create")}</h2>
      <fieldset disabled={mutation.busy}>
        <label htmlFor={`${id}-name`}>{t("agents.name")}</label>
        <input
          id={`${id}-name`}
          name="name"
          value={draft.name}
          required
          maxLength={200}
          aria-invalid={invalid.name || undefined}
          onBlur={(e) => touch(e.currentTarget)}
          onInvalid={(e) => touch(e.currentTarget)}
          onChange={(e) => {
            clear("name");
            setDraft({ ...draft, name: e.target.value });
          }}
        />
        {invalid.name && <p className="field-error">{t("agents.errors.name")}</p>}
        <Quarantine text={draft.name} origin={t("agents.draftName")} />
        <h3>{t("agents.model")}</h3>
        {catalog.state.kind === "loading" && <Loading />}
        {catalog.state.kind === "error" && (
          <Failure error={catalog.state.error} retry={catalog.reload} />
        )}
        {!canEdit && <Denied permission="agent.edit" />}
        {canEdit && catalog.state.kind === "ready" && (
          <>
            <p className="panel-help">{t("agents.modelHelp")}</p>
            <label className="agent-check">
              <input
                type="radio"
                name={`${id}-model`}
                checked={draft.modelId === ""}
                onChange={() => {
                  mutation.clear();
                  setDraft({ ...draft, modelId: "" });
                }}
              />
              {t("agents.noModel")}
            </label>
            {models.length === 0 && <p>{t("agents.noModels")}</p>}
            {draft.modelId && !models.some((model) => model.id === draft.modelId) && (
              <div className="agent-resource">
                <p>{t("agents.unavailablePreserved")}</p>
                <Quarantine text={draft.modelId} origin={t("agents.storedModel")} />
              </div>
            )}
            {models.map((model, index) => (
              <div className="agent-resource" key={model.id}>
                <Quarantine
                  id={`${id}-model-${index}`}
                  text={`${model.name}\n${model.provider}\n${model.id}`}
                  origin={t("agents.modelCatalog")}
                />
                <label className="agent-check">
                  <input
                    type="radio"
                    name={`${id}-model`}
                    aria-describedby={`${id}-model-${index}`}
                    checked={draft.modelId === model.id}
                    onChange={() => {
                      mutation.clear();
                      setDraft({ ...draft, modelId: model.id });
                    }}
                  />
                  {t("agents.chooseModel", {
                    number: new Intl.NumberFormat(i18n.language).format(index + 1),
                  })}
                </label>
              </div>
            ))}
          </>
        )}
        <label htmlFor={`${id}-prompt`}>{t("agents.prompt")}</label>
        <textarea
          id={`${id}-prompt`}
          name="prompt"
          rows={7}
          maxLength={20000}
          value={draft.prompt}
          aria-invalid={invalid.prompt || undefined}
          onBlur={(e) => touch(e.currentTarget)}
          onInvalid={(e) => touch(e.currentTarget)}
          onChange={(e) => {
            clear("prompt");
            setDraft({ ...draft, prompt: e.target.value });
          }}
        />
        <Quarantine text={draft.prompt} origin={t("agents.draftPrompt")} />
        <h3>{t("agents.budgets")}</h3>
        <p className="panel-help">{t("agents.budgetHelp")}</p>
        <div className="agent-budget-grid">
          {BUDGET_FIELDS.map(({ key }) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`}>{t(`agents.${key}`)}</label>
              <input
                id={`${id}-${key}`}
                name={key}
                type="number"
                min={1}
                max={Number.MAX_SAFE_INTEGER}
                step={1}
                required
                value={draft.budgets[key]}
                aria-invalid={invalid[key] || undefined}
                onBlur={(e) => touch(e.currentTarget)}
                onInvalid={(e) => touch(e.currentTarget)}
                onChange={(e) => {
                  clear(key);
                  setDraft({ ...draft, budgets: { ...draft.budgets, [key]: e.target.value } });
                }}
              />
              {invalid[key] && <p className="field-error">{t("agents.errors.budget")}</p>}
            </div>
          ))}
        </div>
        <p className="panel-help">{t("agents.settingsPreserved")}</p>
      </fieldset>
      {mutation.error && <Failure error={mutation.error} />}
      {mutation.saved && <p>{t("agents.saved")}</p>}
      <div className="agent-actions">
        <button className="button button-primary" disabled={blocked}>
          {t(mutation.busy ? "agents.saving" : agent ? "agents.saveConfig" : "agents.create")}
        </button>
        <button className="button" type="button" disabled={mutation.busy} onClick={onCancel}>
          {t("agents.cancel")}
        </button>
      </div>
    </form>
  );
}
