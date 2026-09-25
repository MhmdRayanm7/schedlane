import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useOutletContext, useParams } from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { ServiceDetailsSheet } from "./components/service-details-sheet";
import { ServiceFormSheet } from "./components/service-form-sheet";
import { ServiceList } from "./components/service-list";
import {
  useCreateService,
  useDeactivateService,
  useReactivateService,
  useServices,
  useUpdateService,
} from "./hooks/use-services";
import type { CreateServiceInput, Service, UpdateServiceInput } from "./types";

function ServicesSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading services"
      className="divide-y divide-border rounded-lg border border-border bg-surface"
      role="status"
    >
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center justify-between p-4 sm:px-5">
          <div className="flex items-center gap-3.5">
            <div className="size-2 rounded-full bg-border-strong animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-36 rounded bg-border-strong animate-pulse" />
              <div className="h-3 w-24 rounded bg-border animate-pulse" />
            </div>
          </div>
          <div className="h-4 w-4 rounded bg-border animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ServicesErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-8 text-center">
      <h2 className="text-base font-semibold text-foreground">
        Unable to load services
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        We encountered an error loading your organization's services.
      </p>
      <Button variant="outline" size="sm" onClick={retry} className="mt-4">
        <RefreshCw aria-hidden="true" className="size-3.5" />
        Try again
      </Button>
    </div>
  );
}

function ServicesEmptyState({
  isReadOnly,
  onNewService,
}: {
  isReadOnly: boolean;
  onNewService: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/50 p-12 text-center">
      <h2 className="text-base font-semibold text-foreground">
        No services yet.
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add the first service your organization offers.
      </p>
      {!isReadOnly ? (
        <Button onClick={onNewService} size="sm" className="mt-5">
          <Plus aria-hidden="true" className="size-4" />
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
  const createServiceMutation = useCreateService(organizationId);
  const updateServiceMutation = useUpdateService(organizationId);
  const deactivateServiceMutation = useDeactivateService(organizationId);
  const reactivateServiceMutation = useReactivateService(organizationId);

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null,
  );
  const [editingService, setEditingService] = useState<Service | null>(null);

  const services = servicesQuery.data?.items ?? [];
  const selectedService =
    services.find((s) => s.id === selectedServiceId) ?? null;

  // Infer if pricing is enabled based on any service having non-null price
  const pricingEnabled = services.some((s) => s.priceAgorot !== null);

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
    <div className="relative space-y-6">
      <PageHeader
        title="Services"
        description="Manage the services your organization offers."
        action={
          !isReadOnly ? (
            <Button
              size="sm"
              onClick={() => {
                setEditingService(null);
                setCreateSheetOpen(true);
              }}
            >
              <Plus aria-hidden="true" className="size-4" />
              New service
            </Button>
          ) : null
        }
      />

      <section aria-label="Services list">
        {servicesQuery.isPending ? <ServicesSkeleton /> : null}

        {servicesQuery.isError ? (
          <ServicesErrorState retry={() => void servicesQuery.refetch()} />
        ) : null}

        {servicesQuery.isSuccess && services.length === 0 ? (
          <ServicesEmptyState
            isReadOnly={isReadOnly}
            onNewService={() => {
              setEditingService(null);
              setCreateSheetOpen(true);
            }}
          />
        ) : null}

        {servicesQuery.isSuccess && services.length > 0 ? (
          <ServiceList
            services={services}
            onSelectService={(service) => setSelectedServiceId(service.id)}
          />
        ) : null}
      </section>

      {/* Details Sheet */}
      <ServiceDetailsSheet
        service={selectedService}
        open={Boolean(selectedService)}
        onOpenChange={(open) => {
          if (!open) setSelectedServiceId(null);
        }}
        onEdit={(service) => {
          setSelectedServiceId(null);
          setEditingService(service);
        }}
        onDeactivate={handleDeactivate}
        onReactivate={handleReactivate}
        isReadOnly={isReadOnly}
        isActionPending={
          deactivateServiceMutation.isPending ||
          reactivateServiceMutation.isPending
        }
      />

      {/* Create / Edit Form Sheet */}
      <ServiceFormSheet
        open={createSheetOpen || Boolean(editingService)}
        onOpenChange={(open) => {
          if (!open) {
            setCreateSheetOpen(false);
            setEditingService(null);
          }
        }}
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
