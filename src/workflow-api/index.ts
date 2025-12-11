import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Env } from '../utils/raindrop.gen';

// entry
export default class ApiGateway extends Service<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Route to appropriate handler
    if (url.pathname === '/users') {
      // Call private service for business logic
      const users = "users";
      // const users = await this.env.USER_SERVICE.getUserById('userId');
      return new Response(JSON.stringify(users), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
}