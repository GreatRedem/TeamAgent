import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { approveApproval, listApprovals, rejectApproval } from "../../lib/approvals.js";
import { listEffectivePermissions } from "../../lib/endpoints.js";
import type { Http } from "../../lib/http.js";
import { createApprovalsStore } from "./store.js";

const ApprovalsContext = createContext<ReturnType<typeof createApprovalsStore> | null>(null);

export function ApprovalsProvider({
  http,
  teamId,
  children,
}: {
  http: Http;
  teamId: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () =>
      createApprovalsStore({
        permissions: () => listEffectivePermissions(http, teamId),
        list: () => listApprovals(http, teamId),
        approve: (id) => approveApproval(http, teamId, id),
        reject: (id, reason) => rejectApproval(http, teamId, id, reason),
      }),
    [http, teamId],
  );
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  return <ApprovalsContext.Provider value={store}>{children}</ApprovalsContext.Provider>;
}

export function useApprovals() {
  const store = useContext(ApprovalsContext);
  if (store === null) throw new Error("useApprovals outside ApprovalsProvider");
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, reload: store.reload, decide: store.decide };
}

export function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
