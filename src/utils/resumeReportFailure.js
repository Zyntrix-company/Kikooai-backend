const DEFAULT_MAX_DETAIL = 400;

/**
 * @param {string|null|undefined} msg
 * @param {number} [maxLen]
 */
export function truncateFailureDetail(msg, maxLen = DEFAULT_MAX_DETAIL) {
  if (msg == null || typeof msg !== 'string' || !msg.trim()) {
    return 'No details available.';
  }
  const singleLine = msg.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, maxLen - 1)}…`;
}

/**
 * Best-effort classification for rows created before error_code was stored on jobs.
 * @param {string} msg
 */
export function inferFailureCodeFromMessage(msg) {
  if (!msg) return 'UNKNOWN_ERROR';
  if (msg.includes('AI returned malformed')) return 'AI_PARSE_ERROR';
  if (msg.includes('Failed to download raw asset')) return 'CLOUDINARY_RAW_DOWNLOAD_FAILED';
  if (msg.includes('AI resume analysis failed:') || msg.includes('AI transcription failed:')) {
    return 'AI_SERVICE_ERROR';
  }
  if (msg.includes('AI resume text extraction failed:')) return 'AI_SERVICE_ERROR';
  if (msg.includes('AI resume analysis service failed')) return 'AI_SERVICE_ERROR';
  if (msg.includes('Raw asset not found') || msg.includes('not found on Cloudinary')) {
    return 'FILE_NOT_FOUND_ON_CLOUDINARY';
  }
  return 'UNKNOWN_ERROR';
}

function humanSummary(failureCode) {
  switch (failureCode) {
    case 'AI_PARSE_ERROR':
      return 'Analysis failed: the model returned data that could not be read.';
    case 'AI_SERVICE_ERROR':
      return 'Analysis failed: the AI service returned an error.';
    case 'CLOUDINARY_RAW_DOWNLOAD_FAILED':
      return 'Could not download the resume file from storage.';
    case 'FILE_NOT_FOUND_ON_CLOUDINARY':
      return 'Resume file was not found in storage.';
    default:
      return 'Analysis failed';
  }
}

/**
 * @param {{ job_id: string, analysis_type: string, job_error_message?: string|null, job_error_code?: string|null }} row
 */
export function buildResumeReportFailedResponse(row) {
  const rawMsg     = row.job_error_message || '';
  const storedCode = row.job_error_code && String(row.job_error_code).trim();
  const failure_code =
    storedCode && storedCode.length ? storedCode : inferFailureCodeFromMessage(rawMsg);
  const failure_detail = truncateFailureDetail(rawMsg);

  return {
    status:         'failed',
    report:         null,
    error:          humanSummary(failure_code),
    code:           'ANALYSIS_FAILED',
    failure_code,
    failure_detail,
    job_id:         row.job_id,
    analysis_type:  row.analysis_type,
  };
}
