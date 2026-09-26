import { useEffect, useRef, useState } from "react";
import type { Organization } from "@/features/organizations/types";
import { FormSaveStatus } from "@/shared/components/form-save-status";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Input } from "@/shared/components/ui/input";
import { useTransientSaveState } from "@/shared/hooks/use-transient-save-state";
import { useUnsavedChanges } from "@/shared/unsaved-changes/unsaved-changes";
import { useRenameOrganization } from "../hooks/use-organization-settings";
import styles from "../settings.module.css";
import { settingsActionError } from "../settings-errors";

export function GeneralSettingsSection({
  organization,
}: {
  organization: Organization;
}) {
  const [name, setName] = useState(organization.name);
  const previousPersistedName = useRef(organization.name);
  const [error, setError] = useState<string | null>(null);
  const mutation = useRenameOrganization(organization.id);
  const { successState, clearSaveSuccess, showSaveSuccess } =
    useTransientSaveState({ saving: mutation.isPending });
  const trimmedName = name.trim();
  const dirty = trimmedName !== organization.name;
  const isReadOnly = Boolean(
    organization.archivedAt || organization.suspendedAt,
  );
  const isValid = trimmedName.length > 0 && trimmedName.length <= 120;

  useEffect(() => {
    setName((current) =>
      current.trim() === previousPersistedName.current
        ? organization.name
        : current,
    );
    previousPersistedName.current = organization.name;
  }, [organization.name]);

  useUnsavedChanges({
    id: `settings:general:${organization.id}`,
    dirty,
    discard: () => {
      setName(organization.name);
      setError(null);
      clearSaveSuccess();
    },
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || !isValid || isReadOnly || mutation.isPending) return;
    setError(null);
    try {
      const result = await mutation.mutateAsync(trimmedName);
      setName(result.name);
      showSaveSuccess();
    } catch (caught) {
      setError(
        settingsActionError(caught, "We couldn't save the organization name."),
      );
    }
  }

  return (
    <section className={styles.section} aria-labelledby="settings-general">
      <div className={styles.sectionIntro}>
        <h2 className={styles.sectionTitle} id="settings-general">
          General
        </h2>
        <p className={styles.sectionDescription}>
          Manage your organization&apos;s identity.
        </p>
      </div>
      <form className={styles.sectionContent} onSubmit={save}>
        <FormField
          htmlFor="organization-name"
          label="Organization name"
          error={
            dirty && !isValid
              ? trimmedName.length === 0
                ? "Organization name is required."
                : "Enter a name up to 120 characters."
              : undefined
          }
        >
          <Input
            id="organization-name"
            autoComplete="organization"
            disabled={isReadOnly || mutation.isPending}
            maxLength={120}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
              clearSaveSuccess();
            }}
            required
            value={name}
          />
        </FormField>
        <div className={styles.readOnlyField}>
          <span className={styles.fieldLabel}>Workspace identifier</span>
          <code className={styles.slug}>{organization.slug}</code>
          <span className={styles.fieldHint}>
            Used to identify this workspace.
          </span>
        </div>
        {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
        <div className={styles.saveRow}>
          <FormSaveStatus
            dirty={dirty}
            saving={mutation.isPending}
            successState={successState}
          />
          <Button
            disabled={!dirty || !isValid || isReadOnly || mutation.isPending}
            loading={mutation.isPending}
            loadingLabel="Saving…"
            size="sm"
            type="submit"
          >
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}
