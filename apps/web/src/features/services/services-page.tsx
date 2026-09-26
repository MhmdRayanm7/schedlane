import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useOutletContext, useParams } from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
import { useOrganizationSettings } from "@/features/settings/hooks/use-organization-settings";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { ServiceDetailsSheet } from "./components/service-details-sheet";
import { ServiceFormDialog } from "./components/service-form-dialog";
import { ServiceList } from "./components/service-list";
import {
  useCreateService,
  useDeactivateService,
  useReactivateService,
  useServices,
  useUpdateService,
} from "./hooks/use-services";
import styles from "./services.module.css";
import type { CreateServiceInput, Service, UpdateServiceInput } from "./types";

function ServicesSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading services"
      className={styles.skeletonList}
      role="status"
    >
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={styles.skeletonSummary}>
            <div className={`${styles.skeleton} ${styles.skeletonDot}`} />
            <div className={styles.skeletonCopy}>
              <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
              <div className={`${styles.skeleton} ${styles.skeletonMeta}`} />
            </div>
          </div>
          <div className={`${styles.skeleton} ${styles.skeletonChevron}`} />
        </div>
      ))}
    </div>
  );
}

function ServicesErrorState({ retry }: { retry: () => void }) {
  return (
    <div className={styles.state}>
      <h2 className={styles.stateTitle}>Unable to load services</h2>
      <p className={styles.stateDescription}>
        We encountered an error loading your organization's services.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={retry}
        className={styles.stateAction}
      >
        <RefreshCw aria-hidden="true" className={styles.smallIcon} />
        Try again
      </Button>
    </div>
  );
}

function ServicesEmptyState({
  canCreate,
  isReadOnly,
  onNewService,
}: {
  canCreate: boolean;
  isReadOnly: boolean;
  onNewService: () => void;
}) {
  return (
    <div className={`${styles.state} ${styles.emptyState}`}>
      <h2 className={styles.stateTitle}>No services yet.</h2>
      <p className={styles.stateDescription}>
        Add the first service your organization offers.
      </p>
      {!isReadOnly ? (
        <Button
          disabled={!canCreate}
          onClick={onNewService}
          size="sm"
          className={styles.stateAction}
        >
          <Plus aria-hidden="true" className={styles.icon} />
          New service
        </Button>
      ) : null}
    </div>
  );
}

export function ServicesPage() {
  const { currentOrganization } = useOutletContext<OrganizationAccessContext>();
  const { organizationId = "" } = useParams<{ organizationId: string }>();

  const isReadOnly = Boolean(
    currentOrganization.archivedAt || currentOrganization.suspendedAt,
  );

  const servicesQuery = useServices(organizationId);
  const settingsQuery = useOrganizationSettings(organizationId);
  const createServiceMutation = useCreateService(organizationId);
  const updateServiceMutation = useUpdateService(organizationId);
  const deactivateServiceMutation = useDeactivateService(organizationId);
  const reactivateServiceMutation = useReactivateService(organizationId);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null,
  );
  const [editingService, setEditingService] = useState<Service | null>(null);

  const services = servicesQuery.data?.items ?? [];
  const selectedService =
    services.find((s) => s.id === selectedServiceId) ?? null;

  const pricingEnabled = settingsQuery.data?.pricingEnabled;
  const pricingPolicyReady = pricingEnabled !== undefined;

  async function handleCreateService(
    data: CreateServiceInput | UpdateServiceInput,
  ) {
    await createServiceMutation.mutateAsync(data as CreateServiceInput);
  }

  async function handleUpdateService(
    data: CreateServiceInput | UpdateServiceInput,
  ) {
    if (!editingService) return;
    await updateServiceMutation.mutateAsync({
      serviceId: editingService.id,
      input: data as UpdateServiceInput,
    });
  }

  async function handleDeactivate(serviceId: string) {
    await deactivateServiceMutation.mutateAsync(serviceId);
  }

  async function handleReactivate(serviceId: string) {
    await reactivateServiceMutation.mutateAsync(serviceId);
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Services"
        description="Manage the services your organization offers."
        action={
          !isReadOnly ? (
            <Button
              disabled={!pricingPolicyReady}
              size="sm"
              onClick={() => {
                setEditingService(null);
                setFormDialogOpen(true);
              }}
            >
              <Plus aria-hidden="true" className={styles.icon} />
              New service
            </Button>
          ) : null
        }
      />

      {settingsQuery.isError ? (
        <InlineAlert className={styles.policyAlert} variant="warning">
          <span>
            Pricing policy is unavailable. Service details can be viewed, but
            creating or editing is paused.
          </span>
          <Button
            onClick={() => void settingsQuery.refetch()}
            size="sm"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className={styles.smallIcon} />
            Retry
          </Button>
        </InlineAlert>
      ) : null}

      <section aria-label="Services list">
        {servicesQuery.isPending ? <ServicesSkeleton /> : null}

        {servicesQuery.isError ? (
          <ServicesErrorState retry={() => void servicesQuery.refetch()} />
        ) : null}

        {servicesQuery.data && services.length === 0 ? (
          <ServicesEmptyState
            canCreate={pricingPolicyReady}
            isReadOnly={isReadOnly}
            onNewService={() => {
              setEditingService(null);
              setFormDialogOpen(true);
            }}
          />
        ) : null}

        {servicesQuery.data && services.length > 0 ? (
          <ServiceList
            services={services}
            onSelectService={(service) => {
              setSelectedServiceId(service.id);
              setDetailsOpen(true);
            }}
          />
        ) : null}
      </section>

      <ServiceDetailsSheet
        key={selectedServiceId}
        service={selectedService}
        organizationId={organizationId}
        open={detailsOpen && Boolean(selectedService)}
        onOpenChange={setDetailsOpen}
        onEdit={(service) => {
          setDetailsOpen(false);
          setEditingService(service);
          setFormDialogOpen(true);
        }}
        onDeactivate={handleDeactivate}
        onReactivate={handleReactivate}
        isReadOnly={isReadOnly}
        canEditDetails={pricingPolicyReady}
        isActionPending={
          deactivateServiceMutation.isPending ||
          reactivateServiceMutation.isPending
        }
      />

      <ServiceFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        service={editingService}
        onSubmit={editingService ? handleUpdateService : handleCreateService}
        isPending={
          createServiceMutation.isPending || updateServiceMutation.isPending
        }
        isReadOnly={isReadOnly}
        pricingEnabled={pricingEnabled}
      />
    </div>
  );
}
