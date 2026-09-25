import { normalizeRow, TABLE } from '@/lib/vdpLogics/fields';

export { TABLE, normalizeRow };

export function mapSupabaseError(error) {
  if (!error) return 'Database error';
  if (error.code === '23505') {
    return 'A row with this dealer name and website URL already exists.';
  }
  return error.message || 'Database error';
}
