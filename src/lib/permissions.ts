export type Role =
  | 'platform_super_admin'
  | 'company_owner'
  | 'company_manager'
  | 'booking_agent'
  | 'accountant'
  | 'tour_guide'
  | 'customer';

export type Permission =
  | 'organization.read'
  | 'organization.update'
  | 'members.read'
  | 'members.invite'
  | 'members.manage_roles'
  | 'trips.read'
  | 'trips.create'
  | 'trips.update'
  | 'trips.publish'
  | 'bookings.read'
  | 'bookings.create'
  | 'bookings.approve'
  | 'bookings.cancel'
  | 'customers.read'
  | 'customers.manage'
  | 'finance.read'
  | 'finance.manage'
  | 'reports.read'
  | 'settings.manage'
  | 'platform.admin';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  platform_super_admin: [
    'platform.admin',
    'organization.read',
    'trips.read',
    'reports.read',
  ],
  company_owner: [
    'organization.read',
    'organization.update',
    'members.read',
    'members.invite',
    'members.manage_roles',
    'trips.read',
    'trips.create',
    'trips.update',
    'trips.publish',
    'bookings.read',
    'bookings.create',
    'bookings.approve',
    'bookings.cancel',
    'customers.read',
    'customers.manage',
    'finance.read',
    'finance.manage',
    'reports.read',
    'settings.manage',
  ],
  company_manager: [
    'organization.read',
    'members.read',
    'members.invite',
    'trips.read',
    'trips.create',
    'trips.update',
    'trips.publish',
    'bookings.read',
    'bookings.create',
    'bookings.approve',
    'bookings.cancel',
    'customers.read',
    'customers.manage',
    'finance.read',
    'reports.read',
  ],
  booking_agent: [
    'organization.read',
    'trips.read',
    'bookings.read',
    'bookings.create',
    'bookings.approve',
    'bookings.cancel',
    'customers.read',
    'customers.manage',
  ],
  accountant: [
    'organization.read',
    'trips.read',
    'bookings.read',
    'customers.read',
    'finance.read',
    'finance.manage',
    'reports.read',
  ],
  tour_guide: [
    'organization.read',
    'trips.read',
    'bookings.read',
  ],
  customer: [
    'trips.read',
  ],
};

export interface MembershipContext {
  role: Role;
  status: string;
  customPermissions?: string[];
}

export function hasPermission(
  membership: MembershipContext | null | undefined,
  requiredPermission: Permission
): boolean {
  if (!membership || membership.status !== 'active') {
    return false;
  }
  const rolePerms = ROLE_PERMISSIONS[membership.role] || [];
  if (rolePerms.includes(requiredPermission)) {
    return true;
  }
  if (
    Array.isArray(membership.customPermissions) &&
    membership.customPermissions.includes(requiredPermission)
  ) {
    return true;
  }
  return false;
}

export function canModifyMemberRole(params: {
  actorUid: string;
  actorMembership: MembershipContext;
  targetUserUid: string;
  newRole: Role;
}): { allowed: boolean; reason?: string } {
  const { actorUid, actorMembership, targetUserUid, newRole } = params;

  if (!hasPermission(actorMembership, 'members.manage_roles')) {
    return { allowed: false, reason: 'Missing members.manage_roles permission.' };
  }
  if (actorUid === targetUserUid) {
    return { allowed: false, reason: 'Staff members cannot modify or elevate their own role.' };
  }
  if (newRole === 'platform_super_admin') {
    return { allowed: false, reason: 'Cannot assign platform_super_admin inside tenant scope.' };
  }
  if (
    (newRole === 'company_owner' || newRole === 'company_manager') &&
    actorMembership.role !== 'company_owner'
  ) {
    return { allowed: false, reason: 'Only company_owner can assign owner or manager roles.' };
  }
  return { allowed: true };
}

export type BookingStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export type SeatReserveMode = 'on_pending' | 'on_approved';

export function shouldHoldSeats(status: BookingStatus, mode: SeatReserveMode): boolean {
  if (status === 'rejected' || status === 'cancelled') {
    return false;
  }
  if (mode === 'on_pending') {
    return status === 'pending' || status === 'approved' || status === 'completed' || status === 'no_show';
  }
  return status === 'approved' || status === 'completed' || status === 'no_show';
}

export function computeSeatDelta(params: {
  passengerCount: number;
  currentlyReserved: boolean;
  targetStatus: BookingStatus;
  seatReserveMode: SeatReserveMode;
  availableSeats: number;
}): { seatDelta: number; nextSeatsReserved: boolean; error?: string } {
  const { passengerCount, currentlyReserved, targetStatus, seatReserveMode, availableSeats } = params;
  const targetHoldsSeats = shouldHoldSeats(targetStatus, seatReserveMode);

  if (!currentlyReserved && targetHoldsSeats) {
    if (passengerCount > availableSeats) {
      return {
        seatDelta: 0,
        nextSeatsReserved: false,
        error: `Insufficient capacity: requested ${passengerCount} seats, only ${availableSeats} available.`,
      };
    }
    return { seatDelta: passengerCount, nextSeatsReserved: true };
  }

  if (currentlyReserved && !targetHoldsSeats) {
    return { seatDelta: -passengerCount, nextSeatsReserved: false };
  }

  return { seatDelta: 0, nextSeatsReserved: currentlyReserved };
}

export function checkSubscriptionEntitlement(params: {
  subscriptionStatus: string;
  currentCount: number;
  maxLimit: number;
  resourceName: string;
}): { allowed: boolean; reason?: string } {
  const { subscriptionStatus, currentCount, maxLimit, resourceName } = params;
  if (
    subscriptionStatus === 'expired' ||
    subscriptionStatus === 'suspended' ||
    subscriptionStatus === 'cancelled'
  ) {
    return {
      allowed: false,
      reason: `Organization subscription is ${subscriptionStatus}. Read/export is available; renew subscription to create new ${resourceName}.`,
    };
  }
  if (currentCount >= maxLimit) {
    return {
      allowed: false,
      reason: `Plan limit reached for ${resourceName} (${currentCount}/${maxLimit}). Upgrade plan to increase capacity.`,
    };
  }
  return { allowed: true };
}
