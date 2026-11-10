import type { AppRole } from "./role.type";

// The signed-in person as the server knows them. Built from the session and
// the users table, never from anything the browser sends.
export type AppUser = {
  userId: number;
  email: string;
  fullName: string;
  role: AppRole;
  approverId: number | null;
};
