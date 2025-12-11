import { z } from 'zod';

export const emailSchema = z.string().email();
export const usernameSchema = z.string().min(3).max(50);
export const idSchema = z.string().min(1);

export function validateEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

export function validateUsername(username: string): boolean {
  return usernameSchema.safeParse(username).success;
}

export function validateId(id: string): boolean {
  return idSchema.safeParse(id).success;
}

// Generic validation function
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}