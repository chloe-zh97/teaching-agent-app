/**
 * ElevenLabs API Integration Service
 * Handles all interactions with ElevenLabs Conversational AI API
 *
 * This service makes direct HTTP calls to ElevenLabs REST API
 * (not using the SDK to avoid Node.js dependencies in Cloudflare Workers)
 */

/**
 * ElevenLabs API configuration
 */
let apiKey: string | null = null;
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * Initialize ElevenLabs API key
 * Call this at the start of each request that needs ElevenLabs
 *
 * @param key - ElevenLabs API key from environment variables
 */
export function initializeElevenLabsClient(key: string): void {
  if (!key) {
    throw new Error('ElevenLabs API key is required');
  }

  apiKey = key;
  console.log('✅ ElevenLabs API key initialized');
}

/**
 * Get initialized API key or throw error
 * Internal helper to ensure API key is ready before API calls
 */
function getApiKey(): string {
  if (!apiKey) {
    throw new Error(
      'ElevenLabs API key not initialized. Call initializeElevenLabsClient() first.'
    );
  }
  return apiKey;
}

/**
 * Make a request to ElevenLabs API
 */
async function makeRequest(
  method: string,
  endpoint: string,
  body?: any
): Promise<any> {
  const key = getApiKey();
  const url = `${ELEVENLABS_API_BASE}${endpoint}`;

  const options: RequestInit = {
    method,
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return await response.json();
}

/**
 * Agent configuration for creation
 */
export interface CreateAgentConfig {
  name: string;
  systemPrompt: string;
  voiceId?: string;
  firstMessage?: string;
  language?: string;
  conversationConfig?: {
    turnTimeout?: number;
    agentResponseTimeout?: number;
    ttsSpeed?: number;
  };
}

/**
 * Create a conversational AI agent via ElevenLabs API
 *
 * @param config - Agent configuration
 * @returns Agent ID and name from ElevenLabs
 */
export async function createConversationalAgent(
  config: CreateAgentConfig
): Promise<{
  agentId: string;
  name: string;
}> {
  try {
    // Validate and normalize voice ID (never allow "default" as a literal value)
    const voiceId = 
      !config.voiceId || config.voiceId === 'default' || (typeof config.voiceId === 'string' && config.voiceId.trim() === '')
        ? '21m00Tcm4TlvDq8ikWAM' 
        : config.voiceId;

    console.log(`🎙️  Creating ElevenLabs agent: ${config.name}`);
    console.log(`   Voice ID: ${voiceId}`);
    console.log(`   System prompt length: ${config.systemPrompt.length} chars`);

    // Create agent via ElevenLabs REST API
    const requestBody = {
      name: config.name,
      conversation_config: {
        agent: {
          prompt: {
            prompt: config.systemPrompt,
          },
          first_message: config.firstMessage,
          language: config.language || 'en',
        },
        tts: {
          voice_id: voiceId,
          speed: config.conversationConfig?.ttsSpeed || 1.0,
        },
      },
    };

    const response = await makeRequest('POST', '/convai/agents/create', requestBody);

    console.log(`✅ ElevenLabs agent created: ${response.agent_id}`);

    return {
      agentId: response.agent_id,
      name: config.name,
    };
  } catch (error) {
    console.error('❌ ElevenLabs agent creation failed:', error);

    // Provide helpful error messages
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('unauthorized')) {
        throw new Error('Invalid ElevenLabs API key. Check your ELEVENLABS_API_KEY environment variable.');
      }
      if (error.message.includes('429') || error.message.includes('rate limit')) {
        throw new Error('ElevenLabs API rate limit exceeded. Please try again later.');
      }
      if (error.message.includes('voice_id')) {
        throw new Error('Invalid voice ID. Please check the voice ID is correct.');
      }
    }

    throw new Error(
      `Failed to create ElevenLabs agent: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Update an existing agent's configuration
 *
 * @param agentId - ElevenLabs agent ID to update
 * @param updates - Fields to update
 */
export async function updateConversationalAgent(
  agentId: string,
  updates: {
    name?: string;
    systemPrompt?: string;
    voiceId?: string;
    firstMessage?: string;
  }
): Promise<void> {
  try {
    console.log(`🔄 Updating ElevenLabs agent: ${agentId}`);

    // Build update payload (only include provided fields)
    const updatePayload: any = {};

    if (updates.name !== undefined) {
      updatePayload.name = updates.name;
    }

    // Build conversation_config if needed
    if (updates.systemPrompt !== undefined || updates.voiceId !== undefined || updates.firstMessage !== undefined) {
      updatePayload.conversation_config = {};

      if (updates.systemPrompt !== undefined || updates.firstMessage !== undefined) {
        updatePayload.conversation_config.agent = {};

        if (updates.systemPrompt !== undefined) {
          updatePayload.conversation_config.agent.prompt = {
            prompt: updates.systemPrompt,
          };
          console.log(`   Updated system prompt (${updates.systemPrompt.length} chars)`);
        }

        if (updates.firstMessage !== undefined) {
          updatePayload.conversation_config.agent.first_message = updates.firstMessage;
        }
      }

      if (updates.voiceId !== undefined) {
        const normalizedVoiceId = 
          !updates.voiceId || updates.voiceId === 'default' || (typeof updates.voiceId === 'string' && updates.voiceId.trim() === '')
            ? '21m00Tcm4TlvDq8ikWAM' // Default: Rachel voice
            : updates.voiceId;
        
        updatePayload.conversation_config.tts = {
          voice_id: normalizedVoiceId,
        };
        console.log(`   Updated voice ID: ${normalizedVoiceId}`);
      }
    }

    await makeRequest('PATCH', `/convai/agents/${agentId}`, updatePayload);

    console.log(`✅ ElevenLabs agent updated: ${agentId}`);
  } catch (error) {
    console.error('❌ ElevenLabs agent update failed:', error);

    if (error instanceof Error && error.message.includes('404')) {
      throw new Error(`Agent ${agentId} not found in ElevenLabs. It may have been deleted.`);
    }

    throw new Error(
      `Failed to update ElevenLabs agent: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete an agent from ElevenLabs
 *
 * @param agentId - ElevenLabs agent ID to delete
 */
export async function deleteConversationalAgent(agentId: string): Promise<void> {
  try {
    console.log(`🗑️  Deleting ElevenLabs agent: ${agentId}`);

    await makeRequest('DELETE', `/convai/agents/${agentId}`);

    console.log(`✅ ElevenLabs agent deleted: ${agentId}`);
  } catch (error) {
    console.error('❌ ElevenLabs agent deletion failed:', error);

    // Don't throw on 404 - agent might already be deleted
    if (error instanceof Error && error.message.includes('404')) {
      console.log(`⚠️  Agent ${agentId} not found (already deleted?)`);
      return;
    }

    throw new Error(
      `Failed to delete ElevenLabs agent: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get agent details from ElevenLabs
 * Useful for verifying agent exists and checking its configuration
 *
 * @param agentId - ElevenLabs agent ID
 * @returns Agent details from ElevenLabs API
 */
export async function getAgentDetails(agentId: string): Promise<any> {
  try {
    console.log(`🔍 Fetching agent details: ${agentId}`);

    const agent = await makeRequest('GET', `/convai/agents/${agentId}`);

    console.log(`✅ Retrieved agent: ${agent.name || agentId}`);

    return agent;
  } catch (error) {
    console.error('❌ Failed to get agent details:', error);

    if (error instanceof Error && error.message.includes('404')) {
      throw new Error(`Agent ${agentId} not found in ElevenLabs.`);
    }

    throw new Error(
      `Failed to get agent details: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * List all agents in the ElevenLabs account
 * Useful for debugging and admin purposes
 *
 * @returns List of all agents
 */
export async function listAllAgents(): Promise<any[]> {
  try {
    console.log('📋 Listing all ElevenLabs agents');

    const response = await makeRequest('GET', '/convai/agents');

    const agents = response.agents || [];
    console.log(`✅ Found ${agents.length} agents`);

    return agents;
  } catch (error) {
    console.error('❌ Failed to list agents:', error);

    throw new Error(
      `Failed to list agents: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validate that an agent exists and is accessible
 * Returns true if agent exists, false otherwise
 *
 * @param agentId - ElevenLabs agent ID to validate
 */
export async function validateAgentExists(agentId: string): Promise<boolean> {
  try {
    await getAgentDetails(agentId);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get available voices from ElevenLabs
 * Useful for letting teachers choose voices when creating courses
 *
 * @returns List of available voices
 */
export async function getAvailableVoices(): Promise<any[]> {
  try {
    console.log('🎤 Fetching available voices');

    const response = await makeRequest('GET', '/voices');

    const voices = response.voices || [];
    console.log(`✅ Found ${voices.length} voices`);

    return voices;
  } catch (error) {
    console.error('❌ Failed to fetch voices:', error);

    throw new Error(
      `Failed to get voices: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Test the ElevenLabs API connection
 * Useful for health checks and debugging
 *
 * @returns true if connection is successful
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getAvailableVoices();
    return true;
  } catch (error) {
    console.error('❌ ElevenLabs connection test failed:', error);
    return false;
  }
}

/**
 * Cleanup function to reset API key
 * Call this at the end of request lifecycle if needed
 */
export function resetClient(): void {
  apiKey = null;
}

/**
 * Helper: Extract error message from various error types
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}
