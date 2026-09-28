import { CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ApiError } from "@/shared/api/api-error";
import { supportEmail } from "@/shared/api/config";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { useUnsavedChanges } from "@/shared/unsaved-changes/unsaved-changes";
import { useOrganizations } from "../hooks/use-organizations";
import {
  useMyOrganizationRequest,
  useSubmitOrganizationRequest,
} from "./hooks";
import styles from "./organization-onboarding.module.css";
import type { OrganizationRequest, OrganizationRequestInput } from "./types";

const emptyForm: OrganizationRequestInput = {
  name: "",
  description: "",
  contactPhone: "",
  additionalContext: "",
  wantsSetupHelp: false,
};

function valuesFromRequest(
  request: OrganizationRequest,
): OrganizationRequestInput {
  return {
    name: request.name,
    description: request.description ?? "",
    contactPhone: request.contactPhone ?? "",
    additionalContext: request.additionalContext ?? "",
    wantsSetupHelp: request.wantsSetupHelp,
  };
}

function RequestForm({
  initialValues = emptyForm,
}: {
  initialValues?: OrganizationRequestInput;
}) {
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const mutation = useSubmitOrganizationRequest();
  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initialValues),
    [initialValues, values],
  );
  useUnsavedChanges({
    id: "organization-request-form",
    dirty,
    discard: () => setValues(initialValues),
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = values.name.trim();
    const description = values.description.trim();
    if (!name || description.length < 10) {
      setError(
        !name
          ? "Organization name is required."
          : "Please tell us a little more about how you plan to use Schedlane.",
      );
      return;
    }
    setError(null);
    try {
      await mutation.mutateAsync({
        name,
        description,
        ...(values.contactPhone?.trim()
          ? { contactPhone: values.contactPhone.trim() }
          : {}),
        ...(values.additionalContext?.trim()
          ? { additionalContext: values.additionalContext.trim() }
          : {}),
        wantsSetupHelp: values.wantsSetupHelp,
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError &&
          caught.code === "ORGANIZATION_REQUEST_PENDING"
          ? "You already have a request under review."
          : "We couldn't send your request. Please try again.",
      );
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.fields}>
        <FormField htmlFor="organization-name" label="Organization name">
          <Input
            id="organization-name"
            maxLength={120}
            onChange={(event) =>
              setValues({ ...values, name: event.target.value })
            }
            required
            value={values.name}
          />
        </FormField>
        <FormField
          htmlFor="organization-description"
          label="Description / intended use"
          helperText="Tell us what you offer and how your team plans to use Schedlane."
        >
          <Textarea
            id="organization-description"
            maxLength={2000}
            onChange={(event) =>
              setValues({ ...values, description: event.target.value })
            }
            required
            rows={5}
            value={values.description}
          />
        </FormField>
        <div className={styles.twoColumns}>
          <FormField
            htmlFor="contact-phone"
            label="Phone / WhatsApp (optional)"
          >
            <Input
              id="contact-phone"
              maxLength={80}
              onChange={(event) =>
                setValues({ ...values, contactPhone: event.target.value })
              }
              type="tel"
              value={values.contactPhone}
            />
          </FormField>
        </div>
        <FormField
          htmlFor="additional-context"
          label="Additional information (optional)"
        >
          <Textarea
            id="additional-context"
            maxLength={2000}
            onChange={(event) =>
              setValues({ ...values, additionalContext: event.target.value })
            }
            rows={3}
            value={values.additionalContext}
          />
        </FormField>
        <label className={styles.checkboxRow}>
          <input
            checked={values.wantsSetupHelp}
            className={styles.checkbox}
            onChange={(event) =>
              setValues({ ...values, wantsSetupHelp: event.target.checked })
            }
            type="checkbox"
          />
          <span>I'd like help setting up my Schedlane workspace</span>
        </label>
      </div>
      {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
      <div className={styles.submitRow}>
        <p>We'll review your request and email you when there's an update.</p>
        <Button
          disabled={mutation.isPending}
          loading={mutation.isPending}
          loadingLabel="Sending request"
          type="submit"
        >
          Submit request
        </Button>
      </div>
    </form>
  );
}

export function OrganizationOnboarding() {
  const requestQuery = useMyOrganizationRequest();
  const organizationsQuery = useOrganizations();
  const [resubmitting, setResubmitting] = useState(false);
  const existingOrganization = organizationsQuery.data?.items[0] ?? null;

  useEffect(() => {
    if (requestQuery.data?.request?.status === "approved") {
      const interval = window.setInterval(
        () => void organizationsQuery.refetch(),
        3000,
      );
      return () => window.clearInterval(interval);
    }
  }, [organizationsQuery, requestQuery.data?.request?.status]);

  if (requestQuery.isPending) {
    return <div className={styles.loading}>Loading your request status…</div>;
  }
  if (requestQuery.isError) {
    return (
      <section className={styles.stateCard}>
        <h1>We couldn't load your request</h1>
        <p>Check your connection and try again.</p>
        <Button onClick={() => void requestQuery.refetch()} variant="outline">
          <RefreshCw aria-hidden="true" className={styles.icon} /> Try again
        </Button>
      </section>
    );
  }

  const request = requestQuery.data.request;
  if (!request || (request.status !== "pending" && resubmitting)) {
    return (
      <section className={styles.requestCard}>
        <header className={styles.intro}>
          <p className={styles.eyebrow}>Curated onboarding</p>
          <h1>
            {existingOrganization
              ? "Request another organization"
              : "Request your Schedlane workspace"}
          </h1>
          <p>
            Share a few details about your organization. Our team reviews every
            request so each workspace starts with the right foundation.
          </p>
        </header>
        <RequestForm
          initialValues={request ? valuesFromRequest(request) : emptyForm}
        />
        {existingOrganization ? (
          <Link
            className={styles.backLink}
            to={`/app/${existingOrganization.id}/bookings`}
          >
            Back to {existingOrganization.name}
          </Link>
        ) : null}
      </section>
    );
  }

  if (request.status === "pending") {
    return (
      <section className={styles.stateCard}>
        <span className={styles.stateIcon}>
          <Clock3 aria-hidden="true" />
        </span>
        <p className={styles.eyebrow}>Request received</p>
        <h1>We're reviewing your workspace request</h1>
        <p>
          Your request for <strong>{request.name}</strong> is with the Schedlane
          team. We'll email you when a decision is ready.
        </p>
        <p className={styles.timestamp}>
          Submitted {new Date(request.createdAt).toLocaleDateString()}
        </p>
        {supportEmail ? (
          <p className={styles.support}>
            Need help? <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </p>
        ) : null}
        {existingOrganization ? (
          <Link
            className={styles.backLink}
            to={`/app/${existingOrganization.id}/bookings`}
          >
            Return to {existingOrganization.name}
          </Link>
        ) : null}
      </section>
    );
  }

  if (request.status === "rejected") {
    return (
      <section className={styles.stateCard}>
        <p className={styles.eyebrow}>Request update</p>
        <h1>Let's refine your request</h1>
        <p>We weren't able to approve the request for {request.name}.</p>
        {request.rejectionReason ? (
          <div className={styles.reason}>
            <strong>Feedback</strong>
            <p>{request.rejectionReason}</p>
          </div>
        ) : null}
        <Button onClick={() => setResubmitting(true)}>
          Submit a new request
        </Button>
        {existingOrganization ? (
          <Link
            className={styles.backLink}
            to={`/app/${existingOrganization.id}/bookings`}
          >
            Return to {existingOrganization.name}
          </Link>
        ) : null}
        {supportEmail ? (
          <p className={styles.support}>
            Questions? <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className={styles.stateCard}>
      <span className={styles.stateIcon}>
        <CheckCircle2 aria-hidden="true" />
      </span>
      <p className={styles.eyebrow}>Approved</p>
      <h1>Your workspace is being prepared</h1>
      <p>
        {request.name} has been created. We're refreshing your access now; this
        usually takes only a moment.
      </p>
      <Button
        onClick={() => void organizationsQuery.refetch()}
        variant="outline"
      >
        <RefreshCw aria-hidden="true" className={styles.icon} /> Refresh access
      </Button>
      {existingOrganization ? (
        <>
          <Button onClick={() => setResubmitting(true)} variant="outline">
            Request another organization
          </Button>
          <Link
            className={styles.backLink}
            to={`/app/${existingOrganization.id}/bookings`}
          >
            Return to {existingOrganization.name}
          </Link>
        </>
      ) : null}
    </section>
  );
}
