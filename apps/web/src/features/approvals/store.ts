import type { ApprovalOutcome, ApprovalView, RejectionOutcome } from "../../lib/approvals.js";
import { actionable, approvalFailure, canDecide, type ApprovalFailure } from "./helpers.js";

export interface ApprovalTransport {
  permissions: () => Promise<{ permissions: string[] }>;
  list: () => Promise<{ approvals: ApprovalView[] }>;
  approve: (id: string) => Promise<ApprovalOutcome>;
  reject: (id: string, reason?: string) => Promise<RejectionOutcome>;
}

export interface DecisionResult {
  id: string;
  kind: "approved" | "rejected" | "error";
  outcome?: ApprovalOutcome | RejectionOutcome;
  error?: ApprovalFailure;
}

export interface ApprovalsSnapshot {
  kind: "loading" | "ready" | "denied" | "error";
  items: ApprovalView[];
  error: ApprovalFailure | null;
  refreshing: boolean;
  busyId: string | null;
  result: DecisionResult | null;
}

export function createApprovalsStore(api: ApprovalTransport) {
  let state: ApprovalsSnapshot = {
    kind: "loading",
    items: [],
    error: null,
    refreshing: false,
    busyId: null,
    result: null,
  };
  const listeners = new Set<() => void>();
  let active = false;
  let epoch = 0;
  let revision = 0;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  function update(patch: Partial<ApprovalsSnapshot>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }

  function load(afterDecision = false): Promise<void> {
    if (!active || (state.busyId !== null && !afterDecision)) return Promise.resolve();
    if (inFlight !== null) return inFlight;
    const currentEpoch = epoch;
    const currentRevision = revision;
    const current = () => active && epoch === currentEpoch && revision === currentRevision;
    update({ refreshing: true });
    const work = (async () => {
      try {
        const access = await api.permissions();
        if (!current()) return;
        if (!access.permissions.includes("approval.decide")) {
          update({ kind: "denied", items: [], error: null });
          return;
        }
        const data = await api.list();
        if (current()) update({ kind: "ready", items: data.approvals, error: null });
      } catch (caught) {
        if (current()) {
          const error = approvalFailure(caught);
          update({ kind: error.denied ? "denied" : "error", items: [], error });
        }
      } finally {
        if (current()) update({ refreshing: false });
      }
    })();
    inFlight = work;
    void work.finally(() => {
      if (inFlight === work) inFlight = null;
    });
    return work;
  }

  async function decide(id: string, decision: "approve" | "reject", reason?: string) {
    if (!active || state.kind !== "ready" || state.busyId !== null) return;
    const item = state.items.find((entry) => entry.id === id);
    if (
      !item ||
      !canDecide(item, Date.now()) ||
      (decision === "approve" && !actionable(item, Date.now()))
    )
      return;
    if (reason !== undefined && reason.length > 2000) return;
    const currentEpoch = epoch;
    const current = () => active && epoch === currentEpoch;
    revision += 1;
    update({ busyId: id, result: null });
    await inFlight;
    if (!current()) return;
    try {
      if (!canDecide(item, Date.now())) {
        update({
          result: {
            id,
            kind: "error",
            error: { key: "localExpiry", requestId: null, denied: false, unknownOutcome: false },
          },
        });
        return;
      }
      const outcome = decision === "approve" ? await api.approve(id) : await api.reject(id, reason);
      if (current())
        update({ result: { id, kind: decision === "approve" ? "approved" : "rejected", outcome } });
    } catch (caught) {
      if (current())
        update({ result: { id, kind: "error", error: approvalFailure(caught, true) } });
    } finally {
      if (current()) {
        await load(true);
        if (current()) update({ busyId: null, refreshing: false });
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (active) return;
      active = true;
      const currentEpoch = ++epoch;
      if (inFlight) {
        void inFlight.then(() => {
          if (active && epoch === currentEpoch) void load();
        });
      } else void load();
      timer = setInterval(() => {
        void load();
      }, 30_000);
    },
    stop() {
      active = false;
      epoch += 1;
      clearInterval(timer);
    },
    reload: () => load(),
    decide,
  };
}
