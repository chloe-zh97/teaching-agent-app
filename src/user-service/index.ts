import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Env } from '../utils/raindrop.gen';

export default class UserService extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    return new Response('Hello World!');
  }

  async getUserById(userId: string) {
    return { id: userId, name: 'John Doe' };
  }
}