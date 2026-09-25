import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignResourceToService,
  createService,
  deactivateService,
  getServiceResources,
  getServices,
  reactivateService,
  unassignResourceFromService,
  updateService,
} from "../api/services-api";
import type { CreateServiceInput, UpdateServiceInput } from "../types";

export function servicesQueryKey(organizationId: string) {
  return ["organizations", organizationId, "services"] as const;
}

export function useServices(organizationId: string) {
  return useQuery({
    queryKey: servicesQueryKey(organizationId),
    queryFn: ({ signal }) => getServices(organizationId, signal),
    enabled: Boolean(organizationId),
  });
}

export function useCreateService(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateServiceInput) =>
      createService(organizationId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: servicesQueryKey(organizationId),
      });
    },
  });
}

export function useUpdateService(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serviceId,
      input,
    }: {
      serviceId: string;
      input: UpdateServiceInput;
    }) => updateService(organizationId, serviceId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: servicesQueryKey(organizationId),
      });
    },
  });
}

export function useDeactivateService(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serviceId: string) =>
      deactivateService(organizationId, serviceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: servicesQueryKey(organizationId),
      });
    },
  });
}

export function useReactivateService(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serviceId: string) =>
      reactivateService(organizationId, serviceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: servicesQueryKey(organizationId),
      });
    },
  });
}

export function serviceResourcesQueryKey(
  organizationId: string,
  serviceId: string,
) {
  return [
    "organizations",
    organizationId,
    "services",
    serviceId,
    "resources",
  ] as const;
}

export function useServiceResources(
  organizationId: string,
  serviceId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: serviceResourcesQueryKey(organizationId, serviceId),
    queryFn: ({ signal }) =>
      getServiceResources(organizationId, serviceId, signal),
    enabled: Boolean(organizationId && serviceId && enabled),
  });
}

export function useAssignResourceToService(
  organizationId: string,
  serviceId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resourceId: string) =>
      assignResourceToService(organizationId, serviceId, resourceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: serviceResourcesQueryKey(organizationId, serviceId),
      });
    },
  });
}

export function useUnassignResourceFromService(
  organizationId: string,
  serviceId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resourceId: string) =>
      unassignResourceFromService(organizationId, serviceId, resourceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: serviceResourcesQueryKey(organizationId, serviceId),
      });
    },
  });
}
