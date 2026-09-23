export type OutboxEvent<TType extends string, TPayload> = {
  aggregateType: string;
  aggregateId: string;
  eventType: TType;
  payload: TPayload;
  occurredAt: Date;
};
