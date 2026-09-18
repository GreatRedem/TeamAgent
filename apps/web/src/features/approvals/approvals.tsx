import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Quarantine } from "../../components/quarantine.js";
import { useAnnouncer } from "../../components/live-regions.js";
import {
  APPROVAL_STATUSES,
  APPROVAL_TRUST_LEVELS,
  type ApprovalFilters,
  type ApprovalView,
} from "../../lib/approvals.js";
import { useSession } from "../session/session.js";
import {
  actionable,
  actionContext,
  canDecide,
  expiryState,
  groupApprovals,
  knownStatus,
  knownTrust,
  pendingCount,
  plainText,
  reasonKey,
  safeContext,
  timestamp,
  type ApprovalFailure,
} from "./helpers.js";
import { useApprovals, useClock } from "./provider.js";
import "./approvals.css";

export function ApprovalsBadge({ onNavigate }: { onNavigate: () => void }) {
  const { state } = useApprovals();
  const { t, i18n } = useTranslation();
  const now = useClock();
  return (
    <button type="button" className="button approval-badge" onClick={onNavigate}>
      {state.kind === "ready" && state.busyId === null
        ? t("approvals.badge", {
            number: new Intl.NumberFormat(i18n.language).format(pendingCount(state.items, now)),
          })
        : t(
            `approvals.badge${state.kind === "denied" ? "Denied" : state.kind === "error" ? "Error" : "Unknown"}`,
          )}
    </button>
  );
}

export function ApprovalError({ error }: { error: ApprovalFailure }) {
  const { t } = useTranslation();
  return (
    <div className={`approval-notice${error.denied ? " approval-denied" : ""}`}>
      <p>{t(`approvals.errors.${error.key}`)}</p>
      <Quarantine
        origin={t("approvals.requestId")}
        text={error.requestId ?? t("approvals.unavailable")}
      />
    </div>
  );
}

export function ApprovalTime({ value }: { value: string | null }) {
  const { t, i18n } = useTranslation();
  const ms = timestamp(value);
  return ms === null ? (
    <span>{t("approvals.unavailable")}</span>
  ) : (
    <time dateTime={value!}>
      {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "long" }).format(
        ms,
      )}
    </time>
  );
}

export function ApprovalExpiry({ item, now }: { item: ApprovalView; now: number }) {
  const { t, i18n } = useTranslation();
  const expiry = expiryState(item, now);
  return (
    <div className="approval-expiry">
      <span>{t("approvals.expires")} </span>
      <ApprovalTime value={item.expires_at} />
      {item.status === "pending" && (
        <p>
          {expiry === "open"
            ? t("approvals.countdown", {
                seconds: new Intl.NumberFormat(i18n.language).format(
                  Math.ceil((timestamp(item.expires_at)! - now) / 1000),
                ),
              })
            : t(`approvals.${expiry === "invalid" ? "invalidExpiry" : "elapsed"}`)}
        </p>
      )}
    </div>
  );
}

function Reference({ value, label }: { value: string | null; label: string }) {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  return (
    <div className="approval-reference">
      <Quarantine origin={label} text={value ?? t("approvals.unavailable")} />
      {value && (
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            void Promise.resolve()
              .then(() => navigator.clipboard.writeText(value))
              .then(
                () => announce(t("approvals.copied")),
                () => announce(t("approvals.copyFailed")),
              );
          }}
        >
          {t("approvals.copy", { label })}
        </button>
      )}
    </div>
  );
}

export function ApprovalsScreen() {
  const { state: session } = useSession();
  const { state, reload } = useApprovals();
  const { t, i18n } = useTranslation();
  const { announce } = useAnnouncer();
  useEffect(() => {
    if (state.result)
      announce(
        state.result.error
          ? t(`approvals.errors.${state.result.error.key}`)
          : t(`approvals.${state.result.kind}`),
      );
  }, [state.result, announce, t]);
  const [selection, setSelection] = useState<string | null>(null);
  const [filters, setFilters] = useState<ApprovalFilters>({ status: "pending" });
  const now = useClock();
  const item = state.items.find((entry) => entry.id === selection);
  const groups = groupApprovals(state.items, filters);
  const agents = Array.from(
    new Set(state.items.flatMap((entry) => (entry.agent ? [entry.agent.id] : []))),
  );
  const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  return (
    <section className="screen approvals-screen">
      <h1>{t("nav.approvals")}</h1>
      {session.kind === "signedIn" && (
        <Quarantine
          origin={t("agents.activeTeam")}
          text={`${session.activeTeam.name}\n${session.activeTeam.id}`}
        />
      )}
      <div className="approval-actions">
        <button
          type="button"
          className="button"
          disabled={state.refreshing || state.busyId !== null}
          onClick={() => {
            void reload();
          }}
        >
          {t("approvals.refresh")}
        </button>
        {state.refreshing && <span>{t("approvals.loading")}</span>}
      </div>
      {state.kind === "denied" && !state.error && (
        <p className="approval-notice approval-denied">{t("approvals.denied")}</p>
      )}
      {state.error && <ApprovalError error={state.error} />}
      {state.result && (state.kind !== "ready" || state.result.id !== selection || !item) && (
        <div className="approval-notice">
          <Quarantine origin={t("approvals.approvalId")} text={state.result.id} />
          {state.result.error ? (
            <ApprovalError error={state.result.error} />
          ) : (
            <p>{t(`approvals.${state.result.kind}`)}</p>
          )}
        </div>
      )}
      {selection !== null && (
        <button type="button" className="button button-quiet" onClick={() => setSelection(null)}>
          {t("approvals.back")}
        </button>
      )}
      {state.kind === "ready" &&
        (selection !== null ? (
          item ? (
            <ApprovalReview key={item.id} item={item} now={now} />
          ) : (
            <p className="approval-notice">{t("approvals.noLongerAvailable")}</p>
          )
        ) : (
          <>
            <div className="approval-filters">
              <label>
                {t("approvals.status")}
                <select
                  value={filters.status ?? ""}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      status:
                        event.target.value === ""
                          ? undefined
                          : (event.target.value as ApprovalFilters["status"]),
                    })
                  }
                >
                  <option value="">{t("approvals.all")}</option>
                  {APPROVAL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(`approvals.statuses.${status}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("approvals.trust")}
                <select
                  value={filters.context_trust_level ?? ""}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      context_trust_level:
                        event.target.value === ""
                          ? undefined
                          : (event.target.value as ApprovalFilters["context_trust_level"]),
                    })
                  }
                >
                  <option value="">{t("approvals.all")}</option>
                  {APPROVAL_TRUST_LEVELS.map((trust) => (
                    <option key={trust} value={trust}>
                      {t(`approvals.trusts.${trust}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("approvals.agentFilter")}
                <select
                  value={filters.agent_id ?? ""}
                  onChange={(event) =>
                    setFilters({ ...filters, agent_id: event.target.value || undefined })
                  }
                >
                  <option value="">{t("approvals.all")}</option>
                  {agents.map((id, index) => (
                    <option key={id} value={id}>
                      {t("approvals.agentNumber", { number: number(index + 1) })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {filters.agent_id && (
              <Quarantine
                origin={t("approvals.agentIdentity")}
                text={plainText(
                  state.items.find((entry) => entry.agent?.id === filters.agent_id)?.agent,
                  t("approvals.unavailable"),
                )}
              />
            )}
            <p className="panel-help">
              {t("approvals.available", {
                number: number(groups.reduce((sum, group) => sum + group.records.length, 0)),
              })}
            </p>
            <p className="panel-help">{t("approvals.localFilters")}</p>
            {groups.length === 0 && <p className="approval-notice">{t("approvals.empty")}</p>}
            {groups.map((group) => (
              <section className="approval-group" key={JSON.stringify(group.cause)}>
                <h2>{t(`approvals.reasons.${reasonKey(group.cause)}`)}</h2>
                <p className="panel-help">
                  {t("approvals.groupCount", { number: number(group.records.length) })}
                </p>
                <div
                  className="approval-table-scroll"
                  tabIndex={0}
                  aria-label={t("approvals.queue")}
                >
                  <table className="approval-table">
                    <caption>{t("approvals.nearestExpiry")}</caption>
                    <thead>
                      <tr>
                        {["identity", "status", "expires", "review"].map((key) => (
                          <th key={key} scope="col">
                            {t(`approvals.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.records.map((entry, index) => (
                        <tr key={entry.id}>
                          <td>
                            <Quarantine
                              origin={t("approvals.identity")}
                              text={plainText(
                                {
                                  agent: entry.agent,
                                  approval_id: entry.id,
                                  tool: actionContext(entry)?.tool ?? null,
                                },
                                t("approvals.unavailable"),
                              )}
                            />
                            <Reference label={t("approvals.traceId")} value={entry.trace_id} />
                          </td>
                          <td>
                            {t(`approvals.statuses.${knownStatus(entry.status)}`)}
                            <p>{t(`approvals.trusts.${knownTrust(entry.context_trust_level)}`)}</p>
                          </td>
                          <td>
                            <ApprovalExpiry item={entry} now={now} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button"
                              onClick={() => setSelection(entry.id)}
                            >
                              {t("approvals.reviewNumber", { number: number(index + 1) })}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        ))}
    </section>
  );
}

export function ApprovalEvidence({ item, now }: { item: ApprovalView; now: number }) {
  const { t } = useTranslation();
  const unavailable = t("approvals.unavailable");
  const action = actionContext(item);
  return (
    <>
      <div className="approval-review-heading">
        <h2>{t("approvals.review")}</h2>
        <span>{t(`approvals.statuses.${knownStatus(item.status)}`)}</span>
        <ApprovalExpiry item={item} now={now} />
      </div>
      <div className="approval-evidence">
        <section>
          <h3>{t("approvals.action")}</h3>
          <Quarantine
            origin={t("approvals.agentIdentity")}
            text={plainText(item.agent, unavailable)}
          />
          <Quarantine
            origin={t("approvals.actionRecord")}
            text={plainText(item.proposed_action, unavailable)}
          />
          <p>{t("approvals.requestedUnverified")}</p>
          <Quarantine
            origin={t("approvals.destination")}
            text={action?.destination ?? unavailable}
          />
        </section>
        <section>
          <h3>{t("approvals.why")}</h3>
          <p>{t(`approvals.reasons.${reasonKey(item.decision_reason)}`)}</p>
          <Quarantine
            origin={t("approvals.reasonCode")}
            text={item.decision_reason ?? unavailable}
          />
          <p>
            {t("approvals.trust")}: {t(`approvals.trusts.${knownTrust(item.context_trust_level)}`)}
          </p>
          <h3>{t("approvals.trigger")}</h3>
          <p className="panel-help">{t("approvals.sourceLimitation")}</p>
          <Quarantine
            origin={t("approvals.triggerRecord")}
            text={`${t("approvals.origin")}\n${plainText(item.triggering_origin, unavailable)}\n\n${t("approvals.lastMessage")}\n${item.triggering_content ?? unavailable}`}
          />
        </section>
      </div>
    </>
  );
}

export function ApprovalReview({ item, now }: { item: ApprovalView; now: number }) {
  const { state, decide } = useApprovals();
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const result = state.result?.id === item.id ? state.result : null;
  const canAct = state.kind === "ready" && state.busyId === null && canDecide(item, now);
  return (
    <article className="approval-review">
      <ApprovalEvidence item={item} now={now} />
      <p className="approval-notice">{t("approvals.exactAction")}</p>
      {!safeContext(item) && <p className="approval-notice">{t("approvals.unsafeContext")}</p>}
      {result?.error && <ApprovalError error={result.error} />}
      {result && result.kind !== "error" && (
        <div className="approval-notice">
          <p>{t(`approvals.${result.kind}`)}</p>
          {result.outcome?.status === "waiting_for_approval" && (
            <p>{t("approvals.waitingAgain")}</p>
          )}
          <Quarantine
            origin={t("approvals.runOutcome")}
            text={plainText(result.outcome, t("approvals.unavailable"))}
          />
        </div>
      )}
      {state.busyId !== null && <p>{t("approvals.deciding")}</p>}
      <div className="approval-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={!canAct || !actionable(item, now)}
          onClick={() => {
            void decide(item.id, "approve");
          }}
        >
          {t("approvals.approve")}
        </button>
      </div>
      <form
        className="approval-reject"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.length > 2000) {
            setInvalid(true);
            reasonRef.current?.focus();
            return;
          }
          void decide(item.id, "reject", reason);
        }}
      >
        <label htmlFor="approval-reason">{t("approvals.rejectReason")}</label>
        <textarea
          id="approval-reason"
          ref={reasonRef}
          value={reason}
          maxLength={2000}
          rows={2}
          disabled={state.busyId !== null}
          aria-invalid={invalid}
          aria-describedby="approval-reason-help"
          onChange={(event) => {
            setReason(event.target.value);
            setInvalid(false);
          }}
          onBlur={() => setInvalid(reason.length > 2000)}
        />
        <p id="approval-reason-help" className="panel-help">
          {t(invalid ? "approvals.reasonTooLong" : "approvals.reasonHelp")}
        </p>
        <button type="submit" className="button" disabled={!canAct}>
          {t("approvals.reject")}
        </button>
      </form>
      <details className="approval-metadata">
        <summary>{t("approvals.references")}</summary>
        <Reference label={t("approvals.approvalId")} value={item.id} />
        <Reference label={t("approvals.runId")} value={item.run_id} />
        <Reference label={t("approvals.traceId")} value={item.trace_id} />
        <Reference label={t("approvals.toolCallId")} value={item.tool_call_id} />
        <p>
          {t("approvals.created")} <ApprovalTime value={item.created_at} />
        </p>
        <p>
          {t("approvals.decidedAt")} <ApprovalTime value={item.decided_at} />
        </p>
        <Quarantine
          origin={t("approvals.decidedBy")}
          text={item.decided_by ?? t("approvals.unavailable")}
        />
      </details>
    </article>
  );
}
