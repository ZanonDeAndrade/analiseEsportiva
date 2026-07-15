import { IdentityError } from './identityErrors.js'

export const MembershipRoles = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const

export const membershipRoleValues = [
  MembershipRoles.OWNER,
  MembershipRoles.ADMIN,
  MembershipRoles.MEMBER,
  MembershipRoles.VIEWER,
] as const
export type MembershipRole = (typeof membershipRoleValues)[number]

export const permissionValues = [
  'organization.create',
  'organization.read',
  'organization.update',
  'organization.switch',
  'members.read',
  'members.invite',
  'members.change_role',
  'members.remove',
  'members.transfer_ownership',
  'private.read',
  'private.write',
  'exports.create',
  'jobs.create',
  'api_keys.manage',
  'audit.read',
  'system.manage',
] as const

export type Permission = (typeof permissionValues)[number]

const commonRead: readonly Permission[] = [
  'organization.create',
  'organization.read',
  'organization.switch',
  'members.read',
  'private.read',
]

export const rolePermissions: Readonly<Record<MembershipRole, ReadonlySet<Permission>>> = {
  [MembershipRoles.OWNER]: new Set(permissionValues),
  [MembershipRoles.ADMIN]: new Set([
    ...commonRead,
    'organization.update',
    'members.invite',
    'members.change_role',
    'members.remove',
    'private.write',
    'exports.create',
    'jobs.create',
    'api_keys.manage',
    'audit.read',
    'system.manage',
  ]),
  [MembershipRoles.MEMBER]: new Set([
    ...commonRead,
    'private.write',
    'exports.create',
    'jobs.create',
  ]),
  [MembershipRoles.VIEWER]: new Set(commonRead),
}

export function hasPermission(role: MembershipRole, permission: Permission) {
  return rolePermissions[role].has(permission)
}

export function requirePermission(role: MembershipRole, permission: Permission) {
  if (!hasPermission(role, permission)) {
    throw new IdentityError('forbidden', 'Permissão insuficiente.', 403)
  }
}

export function isMembershipRole(value: unknown): value is MembershipRole {
  return typeof value === 'string' && membershipRoleValues.includes(value as MembershipRole)
}

export function assignableRoles(actorRole: MembershipRole): readonly MembershipRole[] {
  if (actorRole === MembershipRoles.OWNER) {
    return [MembershipRoles.ADMIN, MembershipRoles.MEMBER, MembershipRoles.VIEWER]
  }
  if (actorRole === MembershipRoles.ADMIN) return [MembershipRoles.MEMBER, MembershipRoles.VIEWER]
  return []
}
