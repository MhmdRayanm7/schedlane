import type { ManagedBooking } from "../types";

export type ManagedBookingPresentation =
  | "active"
  | "cancelled"
  | "noShow"
  | "past";

export function managedBookingPresentation(
  booking: Pick<
    ManagedBooking,
    "status" | "serviceEndAt" | "canCancel" | "canEditContact"
  >,
  now: Date = new Date(),
): ManagedBookingPresentation {
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status === "no_show") return "noShow";
  if (
    !booking.canCancel &&
    !booking.canEditContact &&
    new Date(booking.serviceEndAt).getTime() <= now.getTime()
  ) {
    return "past";
  }
  return "active";
}
