import type { BookingStatus } from "../../db-types.js";

type GuestCancellationPolicyInput = {
  status: BookingStatus;
  startAt: Date;
  cancellationCutoffMinutes: number;
  now: Date;
};

export type GuestCancellationPolicy = {
  cancellationDeadlineAt: Date;
  canCancel: boolean;
};

export function calculateGuestCancellationPolicy({
  status,
  startAt,
  cancellationCutoffMinutes,
  now,
}: GuestCancellationPolicyInput): GuestCancellationPolicy {
  const cancellationDeadlineAt = new Date(
    startAt.getTime() - cancellationCutoffMinutes * 60_000,
  );
  return {
    cancellationDeadlineAt,
    canCancel:
      status === "confirmed" &&
      now.getTime() <= cancellationDeadlineAt.getTime(),
  };
}
