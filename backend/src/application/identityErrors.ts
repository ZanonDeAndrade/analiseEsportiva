export type IdentityErrorCode =
  | 'authentication_required'
  | 'invalid_token'
  | 'identity_not_provisioned'
  | 'email_verification_required'
  | 'user_disabled'
  | 'membership_required'
  | 'session_revoked'
  | 'forbidden'
  | 'not_found'
  | 'reauthentication_required'
  | 'ownership_transfer_required'
  | 'identity_provider_unavailable'
  | 'invalid_request'

export class IdentityError extends Error {
  constructor(
    readonly code: IdentityErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'IdentityError'
  }
}
