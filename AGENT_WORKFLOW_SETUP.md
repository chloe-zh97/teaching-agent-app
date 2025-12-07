# 🎙️ ElevenLabs Agent Workflow Setup Guide

**Complete guide for implementing ElevenLabs Conversational AI agents in your teaching platform**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Installation](#installation)
4. [Environment Setup](#environment-setup)
5. [Testing the Workflow](#testing-the-workflow)
6. [API Endpoints Reference](#api-endpoints-reference)
7. [Troubleshooting](#troubleshooting)
8. [Architecture](#architecture)

---

## Overview

The agent workflow system creates fully-functional ElevenLabs conversational AI tutors for your courses. Here's what happens:

```
Course + Slides → Knowledge Base → System Prompt → ElevenLabs Agent → Database Storage
```

**What's Been Implemented:**

✅ **3 New Files Created:**
- `src/services/prompt.templates.ts` - Prompt engineering system
- `src/services/elevenlabs.service.ts` - ElevenLabs API wrapper
- `src/workflows/agent.workflow.ts` - Workflow orchestration

✅ **Updated Files:**
- `src/agent/index.ts` - Routes now trigger full workflow
- `src/utils/raindrop.gen.ts` - Added ELEVENLABS_API_KEY to Env

✅ **Features:**
- Automatic knowledge base generation from course content
- Accessibility-aware teaching strategies (visual, auditory, kinesthetic, reading)
- System prompt generation with pedagogical best practices
- Complete ElevenLabs agent lifecycle (create, update, delete)
- Knowledge refresh when course content changes

---

## Quick Start

### Prerequisites

1. **ElevenLabs API Key** - Get one at [elevenlabs.io](https://elevenlabs.io)
2. **Node.js** - Already installed (you have package.json)
3. **Cloudflare Workers** - Already configured (you're using Raindrop)

### 5-Minute Setup

```bash
# 1. Install ElevenLabs SDK
npm install @elevenlabs/elevenlabs-js

# 2. Add your API key to Cloudflare Workers
# (Use wrangler CLI or Cloudflare dashboard)
wrangler secret put ELEVENLABS_API_KEY
# When prompted, paste your ElevenLabs API key

# 3. Build and deploy
npm run build
npm run start

# 4. Test the endpoint
curl -X POST http://localhost:8787/api/courses/YOUR_COURSE_ID/agent \
  -H "Content-Type: application/json" \
  -d '{"teacherId": "YOUR_TEACHER_ID"}'
```

---

## Installation

### Step 1: Install Dependencies

```bash
npm install @elevenlabs/elevenlabs-js
```

**Package Details:**
- Package: `@elevenlabs/elevenlabs-js`
- Version: Latest (will auto-install latest stable)
- Purpose: Official ElevenLabs SDK for Node.js/TypeScript

### Step 2: Verify Installation

```bash
npm list @elevenlabs/elevenlabs-js
```

You should see:
```
teaching-agent-app@1.0.0 /path/to/teaching-agent-app
└── @elevenlabs/elevenlabs-js@X.X.X
```

---

## Environment Setup

### Option A: Using Wrangler CLI (Recommended)

```bash
# Set ElevenLabs API key
wrangler secret put ELEVENLABS_API_KEY
# Paste your key when prompted: sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Verify it's set
wrangler secret list
```

### Option B: Using Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to: **Workers & Pages** → Your Worker → **Settings** → **Environment Variables**
3. Click **Add variable**
   - Variable name: `ELEVENLABS_API_KEY`
   - Value: Your ElevenLabs API key (starts with `sk_`)
   - Type: Secret (encrypted)
4. Click **Save and Deploy**

### Option C: Local Development (.dev.vars)

For local testing with `npm run start`:

Create `.dev.vars` file in project root:
```bash
ELEVENLABS_API_KEY=sk_your_elevenlabs_api_key_here
```

**⚠️ IMPORTANT:** Add `.dev.vars` to `.gitignore` to avoid committing secrets!

### Get Your ElevenLabs API Key

1. Go to [elevenlabs.io](https://elevenlabs.io)
2. Sign up or log in
3. Navigate to **Profile** → **API Keys**
4. Click **Generate New API Key**
5. Copy the key (starts with `sk_`)

---

## Testing the Workflow

### Prerequisites for Testing

You need a course with slides. If you don't have one, create it first:

```bash
# 1. Create a user (teacher)
curl -X POST http://localhost:8787/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@example.com",
    "username": "teacher01",
    "role": "teacher",
    "profile": {
      "firstName": "Test",
      "lastName": "Teacher"
    }
  }'

# Response will include userId - save it!
# Example: "userId": "1234567890123-abc123def"

# 2. Create a course
curl -X POST http://localhost:8787/api/courses \
  -H "Content-Type: application/json" \
  -d '{
    "teacherId": "1234567890123-abc123def",
    "title": "Introduction to Machine Learning",
    "description": "Learn the basics of ML",
    "knowledgeText": "Machine learning is a field of AI that enables computers to learn from data without explicit programming...",
    "concepts": ["supervised learning", "neural networks", "gradient descent"],
    "keywords": ["AI", "ML", "data science"],
    "accessibility": "visual",
    "isPublic": true
  }'

# Response includes courseId - save it!
# Example: "courseId": "course_1234567890123-xyz789"

# 3. Create slides for the course (batch create)
curl -X POST http://localhost:8787/api/slides/batch \
  -H "Content-Type: application/json" \
  -d '{
    "slides": [
      {
        "courseId": "course_1234567890123-xyz789",
        "order": 0,
        "title": "What is Machine Learning?",
        "content": [
          {"type": "heading", "content": "Introduction to ML"},
          {"type": "bullet-points", "content": ["ML enables computers to learn", "Used in many applications", "Subset of AI"]}
        ],
        "speakerNotes": "Introduce ML as a subset of AI",
        "accessibilityMode": "visual",
        "generatedBy": "teacher"
      },
      {
        "courseId": "course_1234567890123-xyz789",
        "order": 1,
        "title": "Types of Learning",
        "content": [
          {"type": "heading", "content": "Three Main Types"},
          {"type": "bullet-points", "content": ["Supervised Learning", "Unsupervised Learning", "Reinforcement Learning"]}
        ],
        "speakerNotes": "Explain the three categories",
        "accessibilityMode": "visual",
        "generatedBy": "ai"
      },
      {
        "courseId": "course_1234567890123-xyz789",
        "order": 2,
        "title": "Neural Networks",
        "content": [
          {"type": "heading", "content": "Building Blocks of Deep Learning"},
          {"type": "text", "content": "Neural networks are inspired by biological neurons"}
        ],
        "speakerNotes": "Discuss neural network architecture",
        "accessibilityMode": "visual",
        "generatedBy": "ai"
      }
    ]
  }'
```

### Test 1: Create Agent (Main Workflow)

```bash
curl -X POST http://localhost:8787/api/courses/course_1234567890123-xyz789/agent \
  -H "Content-Type: application/json" \
  -d '{
    "teacherId": "1234567890123-abc123def",
    "voiceId": "21m00Tcm4TlvDq8ikWAM"
  }'
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Agent created successfully",
  "agentId": "agent_1234567890123-abc123",
  "elevenLabsAgentId": "agent_xxxxxxxxxxxxxxxxxxxxxx",
  "status": "created",
  "warnings": []
}
```

**Note:** The workflow takes 5-10 seconds because it:
1. Fetches course and slides
2. Builds knowledge base
3. Generates system prompt
4. Calls ElevenLabs API
5. Stores everything in KV

**Check Logs:**
You should see beautiful formatted logs like:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 AGENT CREATION WORKFLOW STARTED
   Course ID: course_1234567890123-xyz789
   Teacher ID: 1234567890123-abc123def
   Voice ID: auto-select
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 [1/10] Validating course...
   ✓ Course found: "Introduction to Machine Learning"
🔍 [2/10] Checking for existing agent...
   ✓ No existing agent found
📄 [3/10] Fetching slides...
   ✓ Found 3 slides
...
✅ AGENT CREATION WORKFLOW COMPLETED
```

### Test 2: Get Agent Info

```bash
# Get by course ID
curl http://localhost:8787/api/courses/course_1234567890123-xyz789/agent
```

**Expected Response:**
```json
{
  "success": true,
  "agentId": "agent_1234567890123-abc123",
  "elevenLabsAgentId": "agent_xxxxxxxxxxxxxxxxxxxxxx",
  "voiceId": "21m00Tcm4TlvDq8ikWAM",
  "status": "active",
  "data": {
    "agentId": "agent_1234567890123-abc123",
    "courseId": "course_1234567890123-xyz789",
    "teacherId": "1234567890123-abc123def",
    "status": "active",
    "personality": {
      "name": "Introduction to Machine Learning - AI Tutor",
      "tone": "friendly",
      ...
    }
  }
}
```

### Test 3: Refresh Knowledge (After Updating Slides)

```bash
# First, update a slide or add new content to course
# Then refresh the agent's knowledge base

curl -X POST http://localhost:8787/api/agents/agent_1234567890123-abc123/refresh-knowledge
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Agent knowledge refreshed successfully",
  "data": {
    "agentId": "agent_1234567890123-abc123",
    "updatedAt": "2025-12-06T10:30:00.000Z"
  }
}
```

### Test 4: Delete Agent (Cleanup)

```bash
curl -X DELETE http://localhost:8787/api/agents/agent_1234567890123-abc123
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Agent deleted successfully from both ElevenLabs and database"
}
```

This will:
1. Delete the agent from ElevenLabs
2. Remove from your database
3. Clear course's agent reference

### Test 5: Recreate Agent

If you want to recreate an agent (e.g., change voice):

```bash
curl -X POST http://localhost:8787/api/courses/course_1234567890123-xyz789/agent \
  -H "Content-Type: application/json" \
  -d '{
    "teacherId": "1234567890123-abc123def",
    "voiceId": "EXAVITQu4vr4xnSDxMaL",
    "recreate": true
  }'
```

**Note:** `recreate: true` will delete the old agent and create a new one.

---

## API Endpoints Reference

### 1. Create Agent

**Endpoint:** `POST /api/courses/:courseId/agent`

**Request Body:**
```json
{
  "teacherId": "string (required)",
  "voiceId": "string (optional)",
  "recreate": "boolean (optional, default: false)"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Agent created successfully",
  "agentId": "internal-agent-id",
  "elevenLabsAgentId": "elevenlabs-agent-id",
  "status": "created",
  "warnings": ["array of warnings (optional)"]
}
```

**Response (200 OK if already exists):**
```json
{
  "success": true,
  "message": "Agent already created for this course",
  "agentId": "existing-agent-id",
  "elevenLabsAgentId": "elevenlabs-agent-id",
  "status": "exists"
}
```

**Error Responses:**
- `400 Bad Request` - Missing teacherId or validation error
- `404 Not Found` - Course not found or no slides
- `500 Internal Server Error` - ElevenLabs API error or other failure

---

### 2. Get Agent by Course

**Endpoint:** `GET /api/courses/:courseId/agent`

**Response:**
```json
{
  "success": true,
  "agentId": "string or null",
  "elevenLabsAgentId": "string or null",
  "voiceId": "string",
  "status": "string",
  "data": {
    // Full agent object
  }
}
```

---

### 3. Refresh Agent Knowledge

**Endpoint:** `POST /api/agents/:agentId/refresh-knowledge`

**Use When:**
- Course content updated
- Slides added/removed/modified
- Need to update teaching strategy

**Response:**
```json
{
  "success": true,
  "message": "Agent knowledge refreshed successfully",
  "data": {
    // Updated agent object
  }
}
```

---

### 4. Delete Agent

**Endpoint:** `DELETE /api/agents/:agentId`

**Response:**
```json
{
  "success": true,
  "message": "Agent deleted successfully from both ElevenLabs and database"
}
```

---

## Troubleshooting

### Error: "ElevenLabs API key not configured"

**Problem:** Environment variable not set

**Solutions:**
1. Check if `ELEVENLABS_API_KEY` is in Cloudflare Workers secrets:
   ```bash
   wrangler secret list
   ```
2. If missing, add it:
   ```bash
   wrangler secret put ELEVENLABS_API_KEY
   ```
3. For local dev, create `.dev.vars` file with the key

---

### Error: "Course not found"

**Problem:** Invalid course ID or course doesn't exist

**Solutions:**
1. Verify course exists:
   ```bash
   curl http://localhost:8787/api/courses/YOUR_COURSE_ID
   ```
2. Check the course ID is correct (starts with `course_`)

---

### Error: "No slides found for course"

**Problem:** Course has no slides; agent needs content to learn from

**Solutions:**
1. Create slides first using slide creation endpoints
2. Use batch slide creation for efficiency:
   ```bash
   curl -X POST http://localhost:8787/api/slides/batch \
     -H "Content-Type: application/json" \
     -d '{"slides": [...]}'
   ```

---

### Error: "Invalid ElevenLabs API key"

**Problem:** API key is wrong or expired

**Solutions:**
1. Get a new API key from [elevenlabs.io](https://elevenlabs.io)
2. Update the secret:
   ```bash
   wrangler secret put ELEVENLABS_API_KEY
   ```
3. Verify the key starts with `sk_`

---

### Error: "ElevenLabs API rate limit exceeded"

**Problem:** Too many requests to ElevenLabs API

**Solutions:**
1. Wait a few minutes and retry
2. Check your ElevenLabs plan limits
3. Upgrade your ElevenLabs plan if needed
4. Don't recreate agents unnecessarily (use refresh instead)

---

### Agent Created But Not Working in Frontend

**Problem:** Agent exists but frontend can't connect

**Checklist:**
1. Verify agent status is `active`:
   ```bash
   curl http://localhost:8787/api/courses/YOUR_COURSE_ID/agent
   ```
2. Check the `elevenLabsAgentId` is present (not null)
3. Test agent exists in ElevenLabs dashboard
4. Ensure frontend is using the correct agent ID
5. Check ElevenLabs conversation API is working

---

## Architecture

### File Structure

```
src/
├── services/
│   ├── elevenlabs.service.ts          # ElevenLabs API wrapper
│   └── prompt.templates.ts            # Prompt engineering
├── workflows/
│   └── agent.workflow.ts              # Workflow orchestration
├── agent/
│   └── index.ts                       # Agent routes (updated)
├── repositories/
│   └── agent.repository.ts            # Database operations
└── utils/
    └── raindrop.gen.ts                # Env interface (updated)
```

### Data Flow

```
┌─────────────┐
│  API Request│
│  POST /agent│
└──────┬──────┘
       │
       ↓
┌──────────────────────────────────────┐
│  Agent Routes (src/agent/index.ts)  │
│  - Validates request                │
│  - Checks API key exists            │
│  - Triggers workflow                │
└──────┬───────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────┐
│  Agent Workflow (src/workflows/...)         │
│  1. Fetch course & slides                   │
│  2. Build knowledge base                    │
│  3. Generate system prompt                  │
│  4. Call ElevenLabs API                     │
│  5. Store in database                       │
│  6. Update course record                    │
└──────┬───────────────────────────────────────┘
       │
       ↓
┌──────────────────┐
│  Response to User│
│  - agentId       │
│  - status        │
│  - warnings      │
└──────────────────┘
```

### Prompt Engineering Strategy

**System Prompt Structure:**
1. **Role Definition** - Who the agent is
2. **Course Information** - What it teaches
3. **Teaching Strategy** - How it teaches (accessibility-specific)
4. **Knowledge Base** - What it knows (all slides)
5. **Conversation Guidelines** - How it communicates
6. **Critical Rules** - Boundaries and constraints

**Accessibility Modes:**
- `visual` - References slides, spatial language
- `auditory` - Clear speech, verbal emphasis
- `kinesthetic` - Action-oriented, real-world examples
- `reading` - Structured, detailed explanations

---

## Next Steps

### For Frontend Integration

Your frontend needs to:

1. **Fetch Agent ID:**
   ```javascript
   const response = await fetch(`/api/courses/${courseId}/agent`);
   const { elevenLabsAgentId } = await response.json();
   ```

2. **Connect to Agent:**
   ```javascript
   const conversation = useConversation();
   await conversation.startSession({
     agentId: elevenLabsAgentId, // Use this, not hardcoded!
     connectionType: "webrtc"
   });
   ```

3. **Remove Hardcoded Agent ID:**
   - Search for `agent_1301kayr8fdneh8agzn2vx0hfra0`
   - Replace with dynamic fetch

### For Production Deployment

1. **Set API Key in Production:**
   ```bash
   wrangler secret put ELEVENLABS_API_KEY --env production
   ```

2. **Monitor Logs:**
   ```bash
   wrangler tail --env production
   ```

3. **Consider Rate Limits:**
   - Monitor ElevenLabs API usage
   - Implement caching if needed
   - Add retry logic for transient failures

---

## Success Checklist

- [ ] ElevenLabs SDK installed (`@elevenlabs/elevenlabs-js`)
- [ ] `ELEVENLABS_API_KEY` set in environment
- [ ] Course created with slides
- [ ] Agent creation endpoint tested successfully
- [ ] Agent shows in ElevenLabs dashboard
- [ ] Frontend can fetch agent ID dynamically
- [ ] Frontend can connect to agent via WebRTC
- [ ] Knowledge refresh tested after slide updates
- [ ] Agent deletion tested

---

## Support

**Issues?**
1. Check the logs (look for `━━━━` formatted sections)
2. Verify all prerequisites are met
3. Test with curl commands above
4. Check ElevenLabs dashboard for agent status

**Common Questions:**

Q: **Can I use the same agent for multiple courses?**
A: No, each course gets its own agent with course-specific knowledge.

Q: **How long does agent creation take?**
A: 5-10 seconds (depends on ElevenLabs API response time).

Q: **Can I change the voice after creation?**
A: Yes, use `recreate: true` with new `voiceId`.

Q: **What happens if ElevenLabs API is down?**
A: Agent creation will fail with error. Retry later.

Q: **How much does this cost?**
A: Check [ElevenLabs pricing](https://elevenlabs.io/pricing) - depends on usage.

---

**🎉 You're all set! Your teaching platform now has fully integrated AI tutors powered by ElevenLabs!**
