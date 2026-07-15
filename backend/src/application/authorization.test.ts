import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assignableRoles,
  hasPermission,
  membershipRoleValues,
  rolePermissions,
} from './authorization.js'

test('matriz RBAC central cobre todos os papeis canonicos', () => {
  assert.deepEqual(membershipRoleValues, ['owner', 'admin', 'member', 'viewer'])
  assert.deepEqual(Object.keys(rolePermissions).sort(), [...membershipRoleValues].sort())
  assert.equal(hasPermission('owner', 'members.transfer_ownership'), true)
  assert.equal(hasPermission('admin', 'members.transfer_ownership'), false)
  assert.equal(hasPermission('member', 'private.write'), true)
  assert.equal(hasPermission('viewer', 'private.write'), false)
  assert.deepEqual(assignableRoles('admin'), ['member', 'viewer'])
})
