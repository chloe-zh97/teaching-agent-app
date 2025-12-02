import { Timestamp } from "./common.model";

export enum UserRole {
  TEACHER = 'teacher',
  STUDENT = 'student',
}

export interface User {
  userId: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  profile?: {
    firstName?: string;
    lastName?: string;
    bio?: string;
    avatarUrl?: string;
  };
}

export interface CreateUserInput {
  email: string;
  username: string;
  role: UserRole;
  profile?: User['profile'];
}