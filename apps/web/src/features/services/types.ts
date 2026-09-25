export type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  priceAgorot: number | null;
  bufferAfterMinutes: number;
  displayOrder: number;
  deactivatedAt: string | null;
  createdAt: string;
};

export type ServicesResponse = {
  items: Service[];
};

export type CreateServiceInput = {
  name: string;
  durationMinutes: number;
  priceAgorot: number | null;
  bufferAfterMinutes?: number;
};

export type UpdateServiceInput = {
  name?: string;
  durationMinutes?: number;
  priceAgorot?: number | null;
  bufferAfterMinutes?: number;
};

export type ServiceResourceAssignment = {
  id: string;
  name: string;
  deactivatedAt: string | null;
};

export type ServiceResourcesResponse = {
  items: ServiceResourceAssignment[];
};
