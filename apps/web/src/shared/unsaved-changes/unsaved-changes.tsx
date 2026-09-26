import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useBeforeUnload, useBlocker } from "react-router";
import { DiscardChangesDialog } from "../components/discard-changes-dialog";

type DraftRegistration = {
  dirty: boolean;
  discard: () => void;
  tags: string[];
};

type ChangeScope = {
  ids?: string[];
  tags?: string[];
};

type PendingChange = {
  draftIds: string[];
  continueChange: () => void;
};

type UnsavedChangesContextValue = {
  registerDraft: (id: string, registration: DraftRegistration) => () => void;
  requestChange: (continueChange: () => void, scope?: ChangeScope) => void;
};

type UseUnsavedChangesOptions = {
  id: string;
  dirty: boolean;
  discard?: () => void;
  tags?: string[];
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(
  null,
);

function matchesScope(
  id: string,
  registration: DraftRegistration,
  scope: ChangeScope | undefined,
) {
  if (!scope) return true;
  if (scope.ids?.includes(id)) return true;
  return Boolean(
    scope.tags?.some((tag) => registration.tags.includes(tag)),
  );
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Map<string, DraftRegistration>>(
    () => new Map(),
  );
  const draftsRef = useRef(drafts);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const hasUnsavedChanges = [...drafts.values()].some((draft) => draft.dirty);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash),
  );

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!hasUnsavedChanges) return;
        event.preventDefault();
        event.returnValue = "";
      },
      [hasUnsavedChanges],
    ),
  );

  const registerDraft = useCallback(
    (id: string, registration: DraftRegistration) => {
      const next = new Map(draftsRef.current);
      next.set(id, registration);
      draftsRef.current = next;
      setDrafts(next);

      return () => {
        if (draftsRef.current.get(id) !== registration) return;
        const withoutDraft = new Map(draftsRef.current);
        withoutDraft.delete(id);
        draftsRef.current = withoutDraft;
        setDrafts(withoutDraft);
      };
    },
    [],
  );

  const requestChange = useCallback(
    (continueChange: () => void, scope?: ChangeScope) => {
      const dirtyDraftIds = [...draftsRef.current.entries()]
        .filter(
          ([id, registration]) =>
            registration.dirty && matchesScope(id, registration, scope),
        )
        .map(([id]) => id);

      if (dirtyDraftIds.length === 0) {
        continueChange();
        return;
      }

      setPendingChange({ draftIds: dirtyDraftIds, continueChange });
    },
    [],
  );

  const keepEditing = () => {
    setPendingChange(null);
    if (blocker.state === "blocked") blocker.reset();
  };

  const discardAndContinue = () => {
    if (blocker.state === "blocked") {
      const next = new Map(draftsRef.current);
      for (const [id, draft] of draftsRef.current.entries()) {
        if (draft.dirty) {
          draft.discard();
          next.set(id, { ...draft, dirty: false });
        }
      }
      draftsRef.current = next;
      setDrafts(next);
      setPendingChange(null);
      blocker.proceed();
      return;
    }

    if (pendingChange) {
      const next = new Map(draftsRef.current);
      for (const id of pendingChange.draftIds) {
        const draft = draftsRef.current.get(id);
        if (draft) {
          draft.discard();
          next.set(id, { ...draft, dirty: false });
        }
      }
      draftsRef.current = next;
      setDrafts(next);
      const continueChange = pendingChange.continueChange;
      setPendingChange(null);
      continueChange();
    }
  };

  const value = useMemo(
    () => ({ registerDraft, requestChange }),
    [registerDraft, requestChange],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <DiscardChangesDialog
        open={pendingChange !== null || blocker.state === "blocked"}
        onCancel={keepEditing}
        onDiscard={discardAndContinue}
      />
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges({
  id,
  dirty,
  discard,
  tags = [],
}: UseUnsavedChangesOptions) {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error(
      "useUnsavedChanges must be used within UnsavedChangesProvider",
    );
  }

  const discardRef = useRef(discard);
  discardRef.current = discard;
  const tagsKey = tags.join("\u0000");

  useLayoutEffect(
    () =>
      context.registerDraft(id, {
        dirty,
        discard: () => discardRef.current?.(),
        tags: tagsKey ? tagsKey.split("\u0000") : [],
      }),
    [context, dirty, id, tagsKey],
  );

  return { requestChange: context.requestChange };
}

export function useUnsavedChangesGuard() {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error(
      "useUnsavedChangesGuard must be used within UnsavedChangesProvider",
    );
  }
  return { requestChange: context.requestChange };
}
