export type SlotOccupancyCandidate = {
  startMinute: number;
  startAt: Date;
  occupiedUntilAt: Date;
};

export type ExistingBookingOccupancy = {
  startAt: Date;
  occupiedUntilAt: Date;
};

function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isValidOccupancy(
  occupancy: Readonly<ExistingBookingOccupancy>,
): boolean {
  return (
    isValidDate(occupancy.startAt) &&
    isValidDate(occupancy.occupiedUntilAt) &&
    occupancy.startAt < occupancy.occupiedUntilAt
  );
}

export function filterSlotStartsByBookingOccupancy(
  candidates: readonly Readonly<SlotOccupancyCandidate>[],
  occupiedBookings: readonly Readonly<ExistingBookingOccupancy>[],
): number[] | null {
  for (const candidate of candidates) {
    if (
      !Number.isInteger(candidate.startMinute) ||
      candidate.startMinute < 0 ||
      candidate.startMinute >= 1440 ||
      !isValidOccupancy(candidate)
    )
      return null;
  }
  for (const booking of occupiedBookings) {
    if (!isValidOccupancy(booking)) return null;
  }

  const acceptedStarts = new Set<number>();
  for (const candidate of candidates) {
    const overlaps = occupiedBookings.some(
      (booking) =>
        candidate.startAt < booking.occupiedUntilAt &&
        booking.startAt < candidate.occupiedUntilAt,
    );
    if (!overlaps) acceptedStarts.add(candidate.startMinute);
  }
  return [...acceptedStarts].sort((a, b) => a - b);
}
