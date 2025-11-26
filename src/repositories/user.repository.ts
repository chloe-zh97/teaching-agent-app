import { CreateUserInput, User, UserRole } from '../models/user.model';
import { ConflictError, NotFoundError } from '../utils/errors';
import { KVCache } from '../utils/kv-helpers';
import { validateEmail, validateUsername } from '../utils/validators';
import { BaseRepository } from './base';

export class UserRepository extends BaseRepository<User> {
  constructor(kvCache: KVCache) {
    super(kvCache);
  }

  protected buildKey(...parts: string[]): string {
    return parts.join(':');
  }

  // ============================================
  // USER CRUD OPERATIONS
  // ============================================
  async createUser(input: CreateUserInput): Promise<User> {
    if (!validateEmail(input.email)) {
      throw new ConflictError('Invalid email format');
    }
    if (!validateUsername(input.username)) {
      throw new ConflictError('Username must be 3-50 characters');
    }

    // Check if email already exists
    const existingByEmail = await this.getUserByEmail(input.email);
    if (existingByEmail) {
      throw new ConflictError('Email already registered');
    }

    // Check if username already exists
    const existingByUsername = await this.getUserByUsername(input.username);
    if (existingByUsername) {
      throw new ConflictError('Username already taken');
    }

    const userId = this.generateId('user');
    const user: User = {
      userId,
      email: input.email.toLowerCase(),
      username: input.username,
      role: input.role,
      createdAt: this.now(),
      updatedAt: this.now(),
      profile: input.profile || {},
    };

    await this.create(userId, user);

    // Create email lookup index
    await this.kv.setJSON(
      this.buildKey('user', 'email', user.email),
      userId
    );

    // Create username lookup index
    await this.kv.setJSON(
      this.buildKey('user', 'username', user.username.toLowerCase()),
      userId
    );

    await this.initEmptyListBasedOnRole(user);
    return user;
  }

  // ============================================
  // HELPER FUNCTION
  // ============================================
  async getUserOrNull(userId: string): Promise<User | null> {
    return await this.get(userId);
  }

  async initEmptyListBasedOnRole(user: User) {
    // Initialize empty lists based on role
    const userId = user.userId;
    if (user.role === UserRole.TEACHER) {
      await this.kv.setJSON(
        this.buildKey('user', userId, 'knowledges'),
        []
      );
      // Add to teachers index
      await this.kv.addToList(
        this.buildKey('users', 'teachers'),
        userId
      );
    } else {
      await this.kv.setJSON(
        this.buildKey('user', userId, 'enrollments'),
        []
      );
      await this.kv.setJSON(
        this.buildKey('user', userId, 'sessions'),
        []
      );
      // Add to students index
      await this.kv.addToList(
        this.buildKey('users', 'students'),
        userId
      );
    }
  }

  async getUser(userId: string): Promise<User> {
    const user = await this.get(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return user;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const userId = await this.kv.getJSON<string>(
      this.buildKey('user', 'email', email.toLowerCase())
    );
    if (!userId) return null;
    return await this.getUserOrNull(userId);
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const userId = await this.kv.getJSON<string>(
      this.buildKey('user', 'username', username.toLowerCase())
    );
    if (!userId) return null;
    return await this.getUserOrNull(userId);
  }




}