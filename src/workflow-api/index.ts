// import { Service } from '@liquidmetal-ai/raindrop-framework';
// import { Env } from '../utils/raindrop.gen';
// import { Hono } from 'hono';
// import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';

// // entry
// export default class ApiGateway extends Service<Env> {
//   async fetch(request: Request): Promise<Response> {
//     const url = new URL(request.url);
//     // Route to appropriate handler
//     if (url.pathname === '/courses') {
//       // Call private service for business logic
//       const users = "user";
//       // const users = await this.env.USER_SERVICE.getUserById('userId');
//       return new Response(JSON.stringify(users), {
//         headers: { 'Content-Type': 'application/json' }
//       });
//     }

//     return new Response('Not Found', { status: 404 });
//   }
// }

// const app = new Hono<{ Bindings: Env }>();

/**
 * Entry point
 */
// app.post('/api/courses/:courseId/agent', async (c) => {
//   try {
//     const courseId = c.req.param('courseId');
//     const { voiceId, teacherId, recreate } = await c.req.json();

//     if (!teacherId) {
//       return c.json({ error: 'teacherId is required' }, 400);
//     }

//     // Check for required API keys
//     if (!c.env.ELEVENLABS_API_KEY) {
//       return c.json({
//         error: 'ElevenLabs API key not configured',
//         message: 'Set ELEVENLABS_API_KEY in environment variables',
//       }, 500);
//     }

//     if (!c.env.ANTHROPIC_API_KEY) {
//       return c.json({
//         error: 'Anthropic API key not configured',
//         message: 'Set ANTHROPIC_API_KEY in environment variables',
//       }, 500);
//     }

//     console.log(`🎙️  Creating agent for course ${courseId}`);

//     // Import workflow
//     const {
//       executeAgentCreationWorkflow,
//       recreateAgentWorkflow,
//     } = await import('../services/workflow.service');

//     // Execute workflow (recreate if requested)
//     const result = recreate
//       ? await recreateAgentWorkflow(
//           courseId, 
//           teacherId, 
//           voiceId, 
//           c.env
//         )
//       : await executeAgentCreationWorkflow(
//           courseId, 
//           teacherId, 
//           voiceId, 
//           c.env
//         );

//     return c.json({
//       success: true,
//       message: result.message,
//       agentId: result.agentId,
//       elevenLabsAgentId: result.elevenLabsAgentId,
//       status: result.status,
//       warnings: result.warnings,
//       generatedSlides: result.generatedSlides,
//     }, result.status === 'created' ? 201 : 200);
//   } catch (error) {
//     if (error instanceof ConflictError) {
//       return c.json({ error: error.message }, 409);
//     }
//     if (error instanceof NotFoundError) {
//       return c.json({ error: error.message }, 404);
//     }
//     if (error instanceof ValidationError) {
//       return c.json({ error: error.message }, 400);
//     }
//     console.error('❌ Agent creation failed:', error);
//     return c.json({
//       error: 'Failed to create agent',
//       message: error instanceof Error ? error.message : 'Unknown error',
//     }, 500);
//   }
// });

// export default class extends Service<Env> {
//   async fetch(request: Request): Promise<Response> {
//     return app.fetch(request, this.env);
//   }
// };