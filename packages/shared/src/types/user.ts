import type { UserRole } from "../enums/userRole.js";

interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  isActive: boolean;
  emailVerified: boolean;
}

interface AdminUser extends PublicUser {
  createdAt: Date;
}

export type { PublicUser, AdminUser };
