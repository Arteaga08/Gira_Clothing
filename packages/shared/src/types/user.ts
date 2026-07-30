import type { UserRole } from "../enums/userRole.js";

interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  isActive: boolean;
}

interface AdminUser extends PublicUser {
  createdAt: Date;
}

export type { PublicUser, AdminUser };
