import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Quarantine } from "../../components/quarantine.js";
import { useAnnouncer } from "../../components/live-regions.js";
import { agentFailure, type AgentFailure } from "./helpers.js";

export type Load<T> =
  | { kind: "loading" }
  | { kind: "error"; error: AgentFailure }
  | { kind: "ready"; data: T };

export function useLoad<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<Load<T>>({ kind: "loading" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let ignore = false;
    setState({ kind: "loading" });
    void loader().then(
      (data) => {
        if (!ignore) setState({ kind: "ready", data });
      },
      (error: unknown) => {
        if (!ignore) setState({ kind: "error", error: agentFailure(error) });
      },
    );
    return () => {
      ignore = true;
    };
  }, [loader, revision]);
  return { state, reload: () => setRevision((value) => value + 1) };
}

export function useMutation() {
  const active = useRef(false);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AgentFailure | null>(null);
  const [saved, setSaved] = useState(false);
  const { announce } = useAnnouncer();
  const { t } = useTranslation();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run<T>(work: () => Promise<T>, success: (data: T) => void, message = "saved") {
    if (lock.current || !active.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await work();
      if (active.current) {
        setSaved(true);
        announce(t(`agents.${message}`));
        success(result);
      }
    } catch (caught) {
      if (active.current) {
        const failure = agentFailure(caught);
        setError(failure);
        announce(t(`agents.errors.${failure.key}`));
      }
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  return {
    busy,
    error,
    saved,
    run,
    clear: () => {
      setError(null);
      setSaved(false);
    },
  };
}

export function Failure({ error, retry }: { error: AgentFailure; retry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={error.denied ? "agent-notice agent-denied" : "agent-notice"}>
      <p>{t(`agents.errors.${error.key}`)}</p>
      <Quarantine
        origin={t("agents.requestId")}
        text={error.requestId ?? t("agents.noRequestId")}
      />
      {retry && (
        <button type="button" className="button" onClick={retry}>
          {t("agents.retry")}
        </button>
      )}
    </div>
  );
}

export function Loading() {
  const { t } = useTranslation();
  return <p className="panel-help">{t("agents.loading")}</p>;
}

export function Denied({ permission }: { permission: string }) {
  const { t } = useTranslation();
  return <p className="agent-notice agent-denied">{t("agents.needsPermission", { permission })}</p>;
}
