import { openRecords } from './records.js';

export function openRecordCorrection(record, options = {}) {
  if (!record?.id) return null;
  return openRecords({
    ...options,
    context: 'professional',
    record,
    professionalActions: true,
  });
}
