import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { Env } from '../utils/raindrop.gen';
import { UserRepository } from '../repositories/user.repository';
import { CreateUserInput } from '../models/user.model';

const app = new Hono<{ Bindings: Env }>();
app.use('*', logger());

app.get('/api/user/:email', async (c) => {
  try {
    const email = c.req.param('email');
    const userRepository = new UserRepository(c.env.KV_CACHE);
    const user = await userRepository.getUserByEmail(email);
    return c.json({
      success: true,
      email,
      user
    });
  } catch (error) {
    return c.json({
      error: 'Get user failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.post('/api/user', async (c) => {
  try {
    const userRepository = new UserRepository(c.env.KV_CACHE);
    const userInput = await c.req.json() as CreateUserInput;
    const user = await userRepository.createUser(userInput);
    return c.json({
      success: true,
      message: 'Create user successfully',
      user
    });
  } catch (error) {
    return c.json({
      error: 'Create user failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default class extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, this.env);
  }
}

