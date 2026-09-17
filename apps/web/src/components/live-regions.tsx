import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * One polite and one assertive live region per page, centrally managed
 * (docs/24-ui-standards.md). Announce polite for routine outcomes ("Saved",
 * "Team switched"); assertive is reserved for session expiry and connection
 * loss, never for success confirmations.
 */
const LiveRegionsContext = createContext<{
  announce: (message: string, politeness?: "polite" | "assertive") => void;
} | null>(null);

export function useAnnouncer() {
  const value = useContext(LiveRegionsContext);
  if (value === null) throw new Error("useAnnouncer outside LiveRegionsProvider");
  return value;
}

export function LiveRegionsProvider({ children }: { children: ReactNode }): ReactNode {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");

  const value = useMemo(
    () => ({
      announce: (message: string, politeness: "polite" | "assertive" = "polite") => {
        // Toggle the text even when repeating the same message, so screen
        // readers re-announce it.
        const set = politeness === "assertive" ? setAssertive : setPolite;
        set("");
        window.setTimeout(() => set(message), 50);
      },
    }),
    [],
  );

  return (
    <LiveRegionsContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {polite}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="visually-hidden">
        {assertive}
      </div>
    </LiveRegionsContext.Provider>
  );
}

/** Visually hidden but exposed to assistive technology. */
export function VisuallyHidden({ children }: { children: ReactNode }): ReactNode {
  return <span className="visually-hidden">{children}</span>;
}
