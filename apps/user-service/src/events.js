export async function queueUserEvent(db, event) {
  await db.query(
    `INSERT INTO events.outbox_events
       (aggregate_type, aggregate_id, event_type, payload, headers)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      JSON.stringify(event.payload ?? {}),
      JSON.stringify({
        actor_user_id: event.actorUserId ?? '',
        project_id: event.projectId ?? '',
        diagram_id: event.diagramId ?? '',
        entity_type: event.entityType ?? '',
        entity_id: event.entityId ?? '',
      }),
    ],
  );
}
