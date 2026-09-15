import { SupabaseClient } from '@supabase/supabase-js';
import { logChange } from '@/lib/changeLog';

// The fields an owner can correct on an existing guide from the Edit panel. Deliberately
// excludes guide_number, status, auth_user_id, claim_token and claimed_at — those are
// system-controlled (and guide_number/status/auth_user_id are locked at the DB level by
// guides_field_guard_trg), so sending them on an update risks the whole write being rejected.
export interface GuideEditableDetails {
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  base_rate: number;
  notes: string | null;
  languages: string | null;
  licensed: boolean;
  tours_qualified: string | null;
  account_holder: string | null;
  iban: string | null;
  swift_code: string | null;
  bank_name: string | null;
  bank_address: string | null;
  contracted: boolean;
  contract_date: string | null;
}

const FIELD_LABELS: Record<keyof GuideEditableDetails, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  base_rate: 'Base rate',
  notes: 'Notes',
  languages: 'Languages',
  licensed: 'Licensed',
  tours_qualified: 'Tours qualified',
  account_holder: 'Account holder',
  iban: 'IBAN',
  swift_code: 'Swift code',
  bank_name: 'Bank name',
  bank_address: 'Bank address',
  contracted: 'Contracted',
  contract_date: 'Contract date',
};

// Single write path for owner edits to a guide's own details, so every change lands in
// change_logs with an old -> new value, one row per changed field.
export async function updateGuideDetails(
  supabase: SupabaseClient,
  userId: string,
  guideId: string,
  guideName: string,
  before: GuideEditableDetails,
  after: GuideEditableDetails
): Promise<{ error: string | null; changedFields: (keyof GuideEditableDetails)[] }> {
  const changedFields = (Object.keys(FIELD_LABELS) as (keyof GuideEditableDetails)[]).filter(
    field => before[field] !== after[field]
  );

  if (changedFields.length === 0) {
    return { error: null, changedFields: [] };
  }

  const payload: Partial<Record<keyof GuideEditableDetails, unknown>> = {};
  changedFields.forEach(field => { payload[field] = after[field]; });

  const { error } = await supabase.from('guides').update(payload).eq('id', guideId);
  if (error) return { error: error.message, changedFields: [] };

  for (const field of changedFields) {
    await logChange(supabase, userId, {
      tableName: 'guides',
      recordId: guideId,
      fieldName: field,
      oldValue: before[field],
      newValue: after[field],
      description: `${FIELD_LABELS[field]} updated for guide ${guideName}`,
    });
  }

  return { error: null, changedFields };
}
