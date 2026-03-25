import { SupabaseClient } from '@supabase/supabase-js';

export async function logChange(
  supabase: SupabaseClient,
  userId: string,
  params: {
    tableName: string
    recordId: string
    fieldName?: string
    oldValue?: any
    newValue?: any
    changedBy?: string
    description: string
  }
) {
  const { error } = await supabase.from('change_logs').insert({
    user_id: userId,
    table_name: params.tableName,
    record_id: params.recordId,
    field_name: params.fieldName || null,
    old_value: params.oldValue != null 
      ? JSON.stringify(params.oldValue) : null,
    new_value: params.newValue != null 
      ? JSON.stringify(params.newValue) : null,
    changed_by: params.changedBy || 'owner',
    description: params.description
  });
  
  if (error) {
    console.error('Error logging change:', error);
  }
}
