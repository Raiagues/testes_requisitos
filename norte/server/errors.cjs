class AppError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
const known = new Set(['not_authenticated','not_found','version_conflict','idempotency_conflict','project_limit','content_limit','generation_limit','advanced_required','trial_already_used','choose_editable_project','evidence_required','invalid_fields','cross_project_link','admin_mfa_recent_required','offer_pending','source_not_authorized','generation_suspended','archived','rate_limit','single_user_plan','storage_limit','use_product_first']);
function check(result) {
  if (result.error) { const code = known.has(result.error.message) ? result.error.message : 'operation_unavailable'; const status = /conflict/.test(code) ? 409 : code === 'not_found' ? 404 : /limit/.test(code) ? 429 : 403; throw new AppError(code,status); }
  return result.data;
}
for (const code of ['invalid_grant','invitation_unavailable','team_limit','change_limit','review_required','review_not_authorized','document_removed','seat_limit','quote_expired_or_changed']) { known.add(code); }
module.exports = {AppError, check};
