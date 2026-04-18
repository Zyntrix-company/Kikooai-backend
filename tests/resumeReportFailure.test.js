/**
 * Unit tests for resume report failure payload helpers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResumeReportFailedResponse,
  inferFailureCodeFromMessage,
  truncateFailureDetail,
} from '../src/utils/resumeReportFailure.js';

describe('resumeReportFailure', () => {
  it('truncateFailureDetail collapses whitespace and truncates long strings', () => {
    const long = 'a'.repeat(500);
    const out    = truncateFailureDetail(long, 100);
    assert.equal(out.length, 100);
    assert.ok(out.endsWith('…'));
    assert.equal(truncateFailureDetail('  hello \n world  '), 'hello world');
  });

  it('inferFailureCodeFromMessage maps legacy messages', () => {
    assert.equal(inferFailureCodeFromMessage('AI returned malformed resume analysis response'), 'AI_PARSE_ERROR');
    assert.equal(inferFailureCodeFromMessage('Failed to download raw asset: Not Found'), 'CLOUDINARY_RAW_DOWNLOAD_FAILED');
    assert.equal(inferFailureCodeFromMessage('AI resume analysis failed: quota'), 'GEMINI_QUOTA_EXCEEDED');
    assert.equal(inferFailureCodeFromMessage('AI resume analysis failed: HTTP 429'), 'GEMINI_QUOTA_EXCEEDED');
    assert.equal(inferFailureCodeFromMessage('AI resume analysis service failed'), 'AI_SERVICE_ERROR');
    assert.equal(inferFailureCodeFromMessage(''), 'UNKNOWN_ERROR');
  });

  it('buildResumeReportFailedResponse upgrades AI_SERVICE_ERROR to GEMINI when message is quota', () => {
    const payload = buildResumeReportFailedResponse({
      job_id:             '33333333-3333-3333-3333-333333333333',
      analysis_type:      'analyze',
      job_error_message:  'AI resume analysis failed: [GoogleGenerativeAI Error]: 429 Too Many Requests',
      job_error_code:     'AI_SERVICE_ERROR',
    });
    assert.equal(payload.failure_code, 'GEMINI_QUOTA_EXCEEDED');
  });

  it('buildResumeReportFailedResponse prefers stored job error_code', () => {
    const payload = buildResumeReportFailedResponse({
      job_id:             '11111111-1111-1111-1111-111111111111',
      analysis_type:      'analyze',
      job_error_message:  'ignored when code set',
      job_error_code:     'AI_PARSE_ERROR',
    });
    assert.equal(payload.failure_code, 'AI_PARSE_ERROR');
    assert.equal(payload.code, 'ANALYSIS_FAILED');
    assert.equal(payload.job_id, '11111111-1111-1111-1111-111111111111');
    assert.ok(payload.failure_detail.includes('ignored'));
  });

  it('buildResumeReportFailedResponse infers code when job_error_code is null', () => {
    const payload = buildResumeReportFailedResponse({
      job_id:             '22222222-2222-2222-2222-222222222222',
      analysis_type:      'roast',
      job_error_message:  'AI returned malformed resume analysis response',
      job_error_code:     null,
    });
    assert.equal(payload.failure_code, 'AI_PARSE_ERROR');
    assert.equal(payload.analysis_type, 'roast');
  });
});
