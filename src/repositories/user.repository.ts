// src/repositories/user.repository.ts
import { KvCache } from '@liquidmetal-ai/raindrop-framework';
import { User, CreateUserInput, UserRole } from '../models/user.model';
import { Timestamp } from '../models/common.model';
import { NotFoundError, ValidationError } from '../utils/errors';

// Users (Already implemented):
// ├── user:{userId}
// ├── email_idx:{email}
// ├── username_idx:{username}
// └── role_idx:{role}:{userId}

export class UserRepository {
  private kv: KvCache;
  private readonly USER_PREFIX = 'user:';
  private readonly EMAIL_INDEX_PREFIX = 'email_idx:';
  private readonly USERNAME_INDEX_PREFIX = 'username_idx:';
  private readonly ROLE_INDEX_PREFIX = 'role_idx:';

  constructor(kv: KvCache) {
    this.kv = kv;
  }

  /**
   * Generate a simple unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new user
   */
  async create(input: CreateUserInput): Promise<User> {
    // Check if email already exists
    const emailKey = `${this.EMAIL_INDEX_PREFIX}${input.email.toLowerCase()}`;
    const existingEmailUser = await this.kv.get(emailKey);
    if (existingEmailUser) {
      throw new ValidationError('Email already exists');
    }

    // Check if username already exists
    const usernameKey = `${this.USERNAME_INDEX_PREFIX}${input.username.toLowerCase()}`;
    const existingUsernameUser = await this.kv.get(usernameKey);
    if (existingUsernameUser) {
      throw new ValidationError('Username already exists');
    }

    const now: Timestamp = new Date().toISOString();
    const userId = this.generateId();

    const user: User = {
      userId,
      email: input.email,
      username: input.username,
      role: input.role,
      createdAt: now,
      updatedAt: now,
      profile: input.profile,
    };

    // Store user data
    const userKey = `${this.USER_PREFIX}${userId}`;
    await this.kv.put(userKey, JSON.stringify(user));

    // Create indexes
    await this.kv.put(emailKey, userId);
    await this.kv.put(usernameKey, userId);
    await this.kv.put(`${this.ROLE_INDEX_PREFIX}${input.role}:${userId}`, userId);

    return user;
  }

  /**
   * Get user by ID
   */
  async getById(userId: string): Promise<User> {
    const userKey = `${this.USER_PREFIX}${userId}`;
    const userData = await this.kv.get(userKey);

    if (!userData) {
      throw new NotFoundError(`User with ID ${userId} not found`);
    }

    return JSON.parse(userData) as User;
  }

  /**
   * Get user by email
   */
  async getByEmail(email: string): Promise<User> {
    const emailKey = `${this.EMAIL_INDEX_PREFIX}${email.toLowerCase()}`;
    const userId = await this.kv.get(emailKey);

    if (!userId) {
      throw new NotFoundError(`User with email ${email} not found`);
    }

    return this.getById(userId);
  }

  /**
   * Get user by username
   */
  async getByUsername(username: string): Promise<User> {
    const usernameKey = `${this.USERNAME_INDEX_PREFIX}${username.toLowerCase()}`;
    const userId = await this.kv.get(usernameKey);

    if (!userId) {
      throw new NotFoundError(`User with username ${username} not found`);
    }

    return this.getById(userId);
  }

  /**
   * Update user
   */
  async update(
    userId: string,
    updates: Partial<Omit<User, 'userId' | 'createdAt'>>
  ): Promise<User> {
    const existingUser = await this.getById(userId);

    // If email is being updated, check for conflicts
    if (updates.email && updates.email !== existingUser.email) {
      const emailKey = `${this.EMAIL_INDEX_PREFIX}${updates.email.toLowerCase()}`;
      const existingEmailUser = await this.kv.get(emailKey);
      if (existingEmailUser && existingEmailUser !== userId) {
        throw new ValidationError('Email already exists');
      }

      // Delete old email index and create new one
      await this.kv.delete(`${this.EMAIL_INDEX_PREFIX}${existingUser.email.toLowerCase()}`);
      await this.kv.put(emailKey, userId);
    }

    // If username is being updated, check for conflicts
    if (updates.username && updates.username !== existingUser.username) {
      const usernameKey = `${this.USERNAME_INDEX_PREFIX}${updates.username.toLowerCase()}`;
      const existingUsernameUser = await this.kv.get(usernameKey);
      if (existingUsernameUser && existingUsernameUser !== userId) {
        throw new ValidationError('Username already exists');
      }

      // Delete old username index and create new one
      await this.kv.delete(`${this.USERNAME_INDEX_PREFIX}${existingUser.username.toLowerCase()}`);
      await this.kv.put(usernameKey, userId);
    }

    // If role is being updated, update role index
    if (updates.role && updates.role !== existingUser.role) {
      await this.kv.delete(`${this.ROLE_INDEX_PREFIX}${existingUser.role}:${userId}`);
      await this.kv.put(`${this.ROLE_INDEX_PREFIX}${updates.role}:${userId}`, userId);
    }

    const updatedUser: User = {
      ...existingUser,
      ...updates,
      userId: existingUser.userId,
      createdAt: existingUser.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const userKey = `${this.USER_PREFIX}${userId}`;
    await this.kv.put(userKey, JSON.stringify(updatedUser));

    return updatedUser;
  }

  /**
   * Delete user
   */
  async delete(userId: string): Promise<void> {
    const user = await this.getById(userId);

    // Delete user data
    const userKey = `${this.USER_PREFIX}${userId}`;
    await this.kv.delete(userKey);

    // Delete indexes
    await this.kv.delete(`${this.EMAIL_INDEX_PREFIX}${user.email.toLowerCase()}`);
    await this.kv.delete(`${this.USERNAME_INDEX_PREFIX}${user.username.toLowerCase()}`);
    await this.kv.delete(`${this.ROLE_INDEX_PREFIX}${user.role}:${userId}`);
  }

  /**
   * List all users with optional role filter
   */
  async list(options?: { role?: UserRole; limit?: number }): Promise<User[]> {
    const prefix = options?.role 
      ? `${this.ROLE_INDEX_PREFIX}${options.role}:` 
      : this.USER_PREFIX;
    
    const result = await this.kv.list({ 
      prefix, 
      limit: options?.limit || 100 
    });

    const users: User[] = [];

    for (const key of result.keys) {
      try {
        let userId: string;
        
        if (options?.role) {
          // Extract userId from role index key
          userId = key.name.split(':').pop() || '';
        } else {
          // Extract userId from user key
          userId = key.name.replace(this.USER_PREFIX, '');
        }

        const user = await this.getById(userId);
        users.push(user);
      } catch (error) {
        // Skip if user not found (could be deleted)
        console.error(`Error fetching user from key ${key.name}:`, error);
      }
    }

    return users;
  }

  /**
   * Get user count by role
   */
  async countByRole(role: UserRole): Promise<number> {
    const result = await this.kv.list({ 
      prefix: `${this.ROLE_INDEX_PREFIX}${role}:` 
    });
    return result.keys.length;
  }
}