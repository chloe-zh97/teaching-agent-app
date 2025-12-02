// src/user/index.ts
import { Hono } from 'hono';
import { UserRepository } from '../repositories/user.repository';
import { CreateUserInput, UserRole } from '../models/user.model';
import { NotFoundError, ValidationError } from '../utils/errors';
import { validateEmail, validateUsername } from '../utils/validators';
import { Env } from '../utils/raindrop.gen';
import { Service } from '@liquidmetal-ai/raindrop-framework';

const app = new Hono<{ Bindings: Env }>();

// Create a new user
app.post('/api/users', async (c) => {
  try {
    const body = await c.req.json();
    const input: CreateUserInput = body;

    // Validate input
    if (!input.email || !input.username || !input.role) {
      return c.json({ error: 'email, username, and role are required' }, 400);
    }

    if (!validateEmail(input.email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    if (!validateUsername(input.username)) {
      return c.json({ error: 'Invalid username format' }, 400);
    }

    if (!Object.values(UserRole).includes(input.role)) {
      return c.json({ error: 'Invalid role. Must be teacher or student' }, 400);
    }

    const userRepo = new UserRepository(c.env.KV_CACHE);
    const user = await userRepo.create(input);

    return c.json({
      success: true,
      message: 'User created successfully',
      data: user,
    }, 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to create user',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get user by ID
app.get('/api/users/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const userRepo = new UserRepository(c.env.KV_CACHE);
    const user = await userRepo.getById(userId);

    return c.json({
      success: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get user',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get user by email
app.get('/api/users/by-email/:email', async (c) => {
  try {
    const email = c.req.param('email');
    const userRepo = new UserRepository(c.env.KV_CACHE);
    const user = await userRepo.getByEmail(email);

    return c.json({
      success: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get user',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get user by username
app.get('/api/users/by-username/:username', async (c) => {
  try {
    const username = c.req.param('username');
    const userRepo = new UserRepository(c.env.KV_CACHE);
    const user = await userRepo.getByUsername(username);

    return c.json({
      success: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to get user',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// List users (with optional role filter)
app.get('/api/users', async (c) => {
  try {
    const role = c.req.query('role') as UserRole | undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    if (role && !Object.values(UserRole).includes(role)) {
      return c.json({ error: 'Invalid role parameter' }, 400);
    }

    const userRepo = new UserRepository(c.env.KV_CACHE);
    const users = await userRepo.list({ role, limit });

    return c.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to list users',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Update user
app.put('/api/users/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const updates = await c.req.json();

    // Validate email if provided
    if (updates.email && !validateEmail(updates.email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Validate username if provided
    if (updates.username && !validateUsername(updates.username)) {
      return c.json({ error: 'Invalid username format' }, 400);
    }

    // Validate role if provided
    if (updates.role && !Object.values(UserRole).includes(updates.role)) {
      return c.json({ error: 'Invalid role' }, 400);
    }

    // Prevent updating userId and createdAt
    delete updates.userId;
    delete updates.role;
    delete updates.createdAt;

    const userRepo = new UserRepository(c.env.KV_CACHE);
    const user = await userRepo.update(userId, updates);

    return c.json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({
      error: 'Failed to update user',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Delete user
app.delete('/api/users/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const userRepo = new UserRepository(c.env.KV_CACHE);
    await userRepo.delete(userId);

    return c.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({
      error: 'Failed to delete user',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Get user count by role
app.get('/api/users/stats/count-by-role/:role', async (c) => {
  try {
    const role = c.req.param('role') as UserRole;

    if (!Object.values(UserRole).includes(role)) {
      return c.json({ error: 'Invalid role parameter' }, 400);
    }

    const userRepo = new UserRepository(c.env.KV_CACHE);
    const count = await userRepo.countByRole(role);

    return c.json({
      success: true,
      role,
      count,
    });
  } catch (error) {
    return c.json({
      error: 'Failed to count users',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env);
  }
};