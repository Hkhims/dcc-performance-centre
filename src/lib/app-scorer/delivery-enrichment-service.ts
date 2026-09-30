import "server-only";

import {
  normaliseScorerNote,
  validateDeliveryEnrichment,
  validateDeliveryFieldingEvent,
  type DeliveryEnrichment,
  type DeliveryFieldingEvent,
} from "@/lib/app-scorer/delivery-enrichment";
import { createClient } from "@/lib/supabase/server";

export type SaveDeliveryEnrichmentInput = {
  deliveryEventId: string;
  scoringSessionId: string;
  inningsId: string;
  enrichment: DeliveryEnrichment;
};

export type AddDeliveryFieldingEventInput = {
  deliveryEventId: string;
  scoringSessionId: string;
  inningsId: string;
  fieldingEvent: DeliveryFieldingEvent;
};

export async function saveDeliveryEnrichment(
  input: SaveDeliveryEnrichmentInput,
): Promise<string> {
  validateDeliveryEnrichment(input.enrichment);

  const supabase = await createClient();
  const destination = input.enrichment.destination;

  const { data, error } = await supabase.rpc(
    "save_app_scorer_delivery_enrichment",
    {
      target_delivery_event_id: input.deliveryEventId,
      target_scoring_session_id: input.scoringSessionId,
      target_innings_id: input.inningsId,

      target_delivery_line:
        input.enrichment.deliveryLine ?? null,

      target_delivery_length:
        input.enrichment.deliveryLength ?? null,

      target_shot_type:
        input.enrichment.shotType ?? null,

      target_shot_intent:
        input.enrichment.shotIntent ?? null,

      target_contact_type:
        input.enrichment.contactType ?? null,

      target_destination_x:
        destination?.x ?? null,

      target_destination_y:
        destination?.y ?? null,

      target_no_ball_reason:
        input.enrichment.noBallReason ?? null,

      target_wide_direction:
        input.enrichment.wideDirection ?? null,

      target_scorer_note:
        input.enrichment.scorerNote === undefined
          ? null
          : normaliseScorerNote(
              input.enrichment.scorerNote,
            ),
    },
  );

  if (error) {
    throw new Error(
      `Unable to save delivery enrichment: ${error.message}`,
    );
  }

  if (typeof data !== "string") {
    throw new Error(
      "Delivery enrichment persistence returned an invalid enrichment ID.",
    );
  }

  return data;
}

export async function addDeliveryFieldingEvent(
  input: AddDeliveryFieldingEventInput,
): Promise<string> {
  validateDeliveryFieldingEvent(input.fieldingEvent);

  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "add_app_scorer_delivery_fielding_event",
    {
      target_fielding_event_id:
        input.fieldingEvent.fieldingEventId,

      target_delivery_event_id:
        input.deliveryEventId,

      target_scoring_session_id:
        input.scoringSessionId,

      target_innings_id:
        input.inningsId,

      target_sequence_number:
        input.fieldingEvent.sequenceNumber,

      target_event_type:
        input.fieldingEvent.eventType,

      target_fielder_participant_id:
        input.fieldingEvent.fielderParticipantId ?? null,

      target_additional_runs_attributed:
        input.fieldingEvent.additionalRunsAttributed ?? null,
    },
  );

  if (error) {
    throw new Error(
      `Unable to save delivery fielding event: ${error.message}`,
    );
  }

  if (typeof data !== "string") {
    throw new Error(
      "Delivery fielding-event persistence returned an invalid event ID.",
    );
  }

  return data;
}