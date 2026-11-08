const corsErrors = new Set([
  'MissingAllowOriginHeader',
  'MultipleAllowOriginValues',
  'InvalidAllowOriginValue',
  'AllowOriginMismatch',
  'WildcardOriginNotAllowed',
  'InvalidAllowCredentials',
  'PreflightMissingAllowOriginHeader',
  'PreflightAllowOriginMismatch',
  'PreflightInvalidStatus',
  'NoCorsRedirectModeNotFollow',
  'DisallowedByMode'
]);
const networkErrors = new Map([
  ['net::ERR_FAILED', 'FAILED'],
  ['net::ERR_ABORTED', 'ABORTED'],
  ['net::ERR_CONNECTION_REFUSED', 'CONNECTION_REFUSED'],
  ['net::ERR_CONNECTION_RESET', 'CONNECTION_RESET'],
  ['net::ERR_CONNECTION_CLOSED', 'CONNECTION_CLOSED'],
  ['net::ERR_NAME_NOT_RESOLVED', 'NAME_NOT_RESOLVED'],
  ['net::ERR_TIMED_OUT', 'TIMED_OUT'],
  ['net::ERR_CERT_AUTHORITY_INVALID', 'CERT_AUTHORITY_INVALID'],
  ['net::ERR_CERT_DATE_INVALID', 'CERT_DATE_INVALID'],
  ['net::ERR_SSL_PROTOCOL_ERROR', 'SSL_PROTOCOL_ERROR'],
  ['net::ERR_BLOCKED_BY_CLIENT', 'BLOCKED_BY_CLIENT']
]);
const empty = () => ({
  phase: 'not-requested',
  httpStatus: 0,
  corsError: 'NONE',
  blockedReason: 'NONE',
  networkError: 'NONE',
  cancelled: false,
  redirected: false
});
const statusCode = value => (Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0);
const isRedirect = value => [301, 302, 303, 307, 308].includes(value);

export function observeResultNetwork(session) {
  const requests = new Map();
  const urls = new Map();
  const state = id => {
    if (!requests.has(id)) requests.set(id, empty());
    return requests.get(id);
  };
  session.on('Audits.issueAdded', event => {
    const issue = event.issue.details.contentSecurityPolicyIssueDetails;
    if (
      !issue?.blockedURL ||
      issue.isReportOnly !== false ||
      issue.contentSecurityPolicyViolationType !== 'kURLViolation'
    )
      return;
    const current = urls.get(issue.blockedURL) ?? empty();
    Object.assign(current, { phase: 'failed', blockedReason: 'CSP' });
    urls.set(issue.blockedURL, current);
  });
  session.on('Network.requestWillBeSent', event => {
    if (event.request.method !== 'GET') return;
    const current = state(event.requestId);
    current.phase = 'pending';
    if (event.redirectResponse) current.redirected = true;
    urls.set(event.request.url, current);
  });
  session.on('Network.responseReceivedExtraInfo', event => {
    const current = state(event.requestId);
    current.httpStatus = statusCode(event.statusCode);
    current.redirected ||= isRedirect(current.httpStatus);
  });
  session.on('Network.responseReceived', event => {
    const current = state(event.requestId);
    current.phase = 'responded';
    current.httpStatus = statusCode(event.response.status);
  });
  session.on('Network.loadingFinished', event => {
    state(event.requestId).phase = 'finished';
  });
  session.on('Network.loadingFailed', event => {
    const current = state(event.requestId);
    const cors = event.corsErrorStatus?.corsError;
    Object.assign(current, {
      phase: 'failed',
      corsError:
        cors ?
          corsErrors.has(cors) ?
            cors
          : 'OTHER'
        : 'NONE',
      blockedReason:
        event.blockedReason ?
          event.blockedReason === 'csp' ?
            'CSP'
          : 'OTHER'
        : 'NONE',
      networkError: networkErrors.get(event.errorText) ?? 'OTHER',
      cancelled: event.canceled === true,
      redirected: current.redirected || isRedirect(current.httpStatus) || cors === 'NoCorsRedirectModeNotFollow'
    });
  });
  return url => ({ ...(urls.get(url) ?? empty()) });
}

export function resultNetworkFailure(snapshot) {
  if (snapshot.phase !== 'failed') return null;
  if (snapshot.corsError === 'NoCorsRedirectModeNotFollow') return 'RESULT_REDIRECT_BLOCKED';
  if (snapshot.corsError !== 'NONE') return 'RESULT_CORS_BLOCKED';
  if (snapshot.redirected) return 'RESULT_REDIRECT_BLOCKED';
  if (snapshot.blockedReason === 'CSP') return 'RESULT_CSP_BLOCKED';
  if (snapshot.cancelled) return 'RESULT_REQUEST_ABORTED';
  return 'RESULT_REQUEST_FAILED';
}
