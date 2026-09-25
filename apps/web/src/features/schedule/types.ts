export type MinuteInterval = {
  startMinute: number;
  endMinute: number;
};

export type WeekdayHours = {
  weekday: number;
  intervals: MinuteInterval[];
};

export type WeeklyHoursResponse = {
  timezone: "Asia/Jerusalem";
  days: WeekdayHours[];
};

export type AvailabilityMode = "inherit" | "closed" | "custom";

export type ResourceWeekdayHours = {
  weekday: number;
  mode: AvailabilityMode;
  intervals: MinuteInterval[];
};

export type ResourceWeeklyHoursResponse = {
  timezone: "Asia/Jerusalem";
  days: ResourceWeekdayHours[];
};

export type ManageableResource = {
  id: string;
  name: string;
  deactivatedAt: string | null;
};

export type ManageableResourcesResponse = {
  items: ManageableResource[];
};

export type DateOverride = {
  timezone: "Asia/Jerusalem";
  date: string;
  mode: AvailabilityMode;
  intervals: MinuteInterval[];
};

export type TimeBlockItem = {
  id: string;
  startMinute: number;
  endMinute: number;
  createdAt: string;
};

export type ResourceTimeBlocksResponse = {
  timezone: "Asia/Jerusalem";
  resourceId: string;
  date: string;
  items: TimeBlockItem[];
};

export type AvailabilitySettings = {
  slotIntervalMinutes: number;
  minBookingNoticeMinutes: number;
  maxBookingHorizonDays: number;
  publicBookingPaused: boolean;
  cancellationCutoffMinutes: number;
};

export type UpdateAvailabilitySettingsInput = Partial<AvailabilitySettings>;
