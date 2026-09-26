import { useEffect, useRef, useState } from "react";
import type { Organization } from "@/features/organizations/types";
import { FormSaveStatus } from "@/shared/components/form-save-status";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { useTransientSaveState } from "@/shared/hooks/use-transient-save-state";
import { useUnsavedChanges } from "@/shared/unsaved-changes/unsaved-changes";
import { useUpdateStaffTeamVisibility } from "../hooks/use-organization-settings";
import styles from "../settings.module.css";
import { settingsActionError } from "../settings-errors";
import type { StaffTeamVisibility } from "../types";

const options: Array<{
  value: StaffTeamVisibility;
  title: string;
  description: string;
}> = [
  {
    value: "team",
    title: "Entire team",
    description: "Staff can view the members available to them in Team.",
  },
  {
    value: "self",
    title: "Only themselves",
    description: "Staff can only view their own membership.",
  },
];

export function TeamAccessSettingsSection({
  organization,
  persistedVisibility,
}: {
  organization: Organization;
  persistedVisibility: StaffTeamVisibility;
}) {
  const [visibility, setVisibility] = useState(persistedVisibility);
  const previousPersistedVisibility = useRef(persistedVisibility);
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateStaffTeamVisibility(organization.id);
  const { successState, clearSaveSuccess, showSaveSuccess } =
    useTransientSaveState({ saving: mutation.isPending });
  const isOwner = organization.role === "owner";
  const lifecycleReadOnly = Boolean(
    organization.archivedAt || organization.suspendedAt,
  );
  const dirty = visibility !== persistedVisibility;

  useEffect(() => {
    setVisibility((current) =>
      current === previousPersistedVisibility.current
        ? persistedVisibility
        : current,
    );
    previousPersistedVisibility.current = persistedVisibility;
  }, [persistedVisibility]);

  useUnsavedChanges({
    id: `settings:team-access:${organization.id}`,
    dirty,
    discard: () => {
      setVisibility(persistedVisibility);
      setError(null);
      clearSaveSuccess();
    },
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || !isOwner || lifecycleReadOnly || mutation.isPending) return;
    setError(null);
    try {
      const result = await mutation.mutateAsync(visibility);
      setVisibility(result.staffTeamVisibility);
      showSaveSuccess();
    } catch (caught) {
      setError(settingsActionError(caught, "We couldn't save team access."));
    }
  }

  return (
    <section className={styles.section} aria-labelledby="settings-team-access">
      <div className={styles.sectionIntro}>
        <h2 className={styles.sectionTitle} id="settings-team-access">
          Team access
        </h2>
        <p className={styles.sectionDescription}>
          Choose how much of the team staff members can see.
        </p>
      </div>
      <form className={styles.sectionContent} onSubmit={save}>
        <fieldset
          className={styles.policyFieldset}
          disabled={!isOwner || lifecycleReadOnly || mutation.isPending}
        >
          <legend className={styles.fieldLabel}>Staff team visibility</legend>
          <div className={styles.policyOptions}>
            {options.map((option) => (
              <label
                className={styles.policyOption}
                data-selected={visibility === option.value}
                key={option.value}
              >
                <input
                  checked={visibility === option.value}
                  className={styles.radio}
                  name="staff-team-visibility"
                  onChange={() => {
                    setVisibility(option.value);
                    setError(null);
                    clearSaveSuccess();
                  }}
                  type="radio"
                  value={option.value}
                />
                <span className={styles.policyCopy}>
                  <span className={styles.policyTitle}>{option.title}</span>
                  <span className={styles.policyDescription}>
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {!isOwner ? (
          <p className={styles.ownerHint}>
            Only an organization owner can change this policy.
          </p>
        ) : null}
        {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
        {isOwner ? (
          <div className={styles.saveRow}>
            <FormSaveStatus
              dirty={dirty}
              saving={mutation.isPending}
              successState={successState}
            />
            <Button
              disabled={!dirty || lifecycleReadOnly || mutation.isPending}
              loading={mutation.isPending}
              loadingLabel="Saving…"
              size="sm"
              type="submit"
            >
              Save changes
            </Button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
