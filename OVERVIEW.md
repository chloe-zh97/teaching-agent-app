# Backend Repository Overview: Teaching Agent Application

## 🎯 Project Purpose

This is the **backend API** for a **frontend AI slide reader application** with integrated **ElevenLabs conversational agents**. The backend provides REST APIs to support a complete teaching/learning platform where:

- **Teachers** can create AI-powered courses from natural language input
- **Students** can learn interactively with AI agents that can navigate slides, answer questions, and provide personalized guidance
- The system generates course outlines and slides, and integrates with ElevenLabs for voice-enabled conversational AI

---

## 🏗️ Architecture & Technology Stack

### **Framework & Runtime**
- **Raindrop Framework** (`@liquidmetal-ai/raindrop-framework`) - Serverless framework for Cloudflare Workers
- **Hono.js** - Fast web framework for HTTP services
- **TypeScript** - Full type safety
- **Cloudflare Workers** - Edge-computed serverless runtime

### **Data Storage**
- **Cloudflare KV** (Key-Value store) - Primary database for all entities
- Uses structured key patterns for efficient querying and indexing
- No traditional SQL database - everything is document-based in KV

### **Key Dependencies**
- `zod` - Schema validation
- `@hono/zod-openapi` - OpenAPI integration
- `kysely` + `kysely-d1` - Type-safe SQL (for potential future D1 database migration)

---

## 📐 System Architecture

The backend is organized into **service-based modules**, each with its own routes:

```
src/
├── _app/              # App-level config (auth, CORS)
├── user/              # User management service
├── course/            # Course creation & management
├── slide/             # Individual slide management
├── agent/             # ElevenLabs agent configuration
├── session/           # Student learning sessions
├── interaction/       # Q&A, highlights, navigation tracking
├── transcription/     # Audio-to-text transcription (ElevenLabs STT)
├── models/            # TypeScript data models
├── repositories/      # Data access layer (KV operations)
└── utils/             # Helpers (errors, validators, KV utilities)
```

---

## 🎓 Core Entities & Data Models

### **1. User** 
- Roles: `teacher` or `student`
- Profile: name, email, username, bio, avatar
- Indexed by email, username, and role

### **2. Course** (4-Step Creation Workflow)
The course creation follows a **4-step progressive workflow**:

1. **Step 1: Initial Course Creation**
   - Teacher provides: `knowledgeText` (natural language), `concepts` (required topics), `keywords`, `accessibility` mode
   - Status: `draft`

2. **Step 2: Generate Outline**
   - AI generates hierarchical outline structure
   - Status: `outline-generated`
   - Outline embedded in Course (not separate entity)

3. **Step 3: Generate Slides**
   - AI generates individual slides from outline
   - Each slide linked to outline nodes
   - Status: `slides-generated`

4. **Step 4: Create Agent**
   - Creates ElevenLabs conversational agent
   - Agent configured with course knowledge
   - Status: `agent-created` → `published`

**Course States:**
- `draft` → `outline-generated` → `slides-generated` → `agent-created` → `published` → `archived`

### **3. Slide**
- Individual presentation pages
- Content types: text, headings, bullet-points, diagrams, images, code, quotes
- Ordered sequence (0-indexed)
- Linked to outline nodes
- Accessibility-aware (visual, auditory, kinesthetic, reading modes)

### **4. Agent** (ElevenLabs Integration)
- **1:1 relationship** with Course
- Stores ElevenLabs agent ID and voice ID
- Contains:
  - **System prompt** - Generated from course content
  - **Course context** - Compiled knowledge base
  - **Slide references** - For navigation capabilities
  - **Personality** - Teaching style, tone, expertise
- Status: `creating` → `active` / `inactive` / `error`

### **5. Session**
- Represents a student's learning session for a course
- Tracks progress: current slide, visited slides, completed slides
- Status: `active`, `paused`, `completed`
- Supports resume functionality

### **6. Interaction**
- Tracks all student interactions during learning:
  - **Questions** - Q&A with agent
  - **Navigation** - Slide movements
  - **Highlights** - Text highlighting
  - **Annotations** - Student notes
  - **Agent Chat** - Conversational interactions
- Used for analytics and feedback

### **7. Transcription**
- Audio-to-text transcription service
- Uses ElevenLabs Speech-to-Text API
- Auto-expires after 24 hours (KV TTL)
- Supports multiple purposes (course creation, general, etc.)

---

## 🔄 Key Workflows

### **Course Creation Flow**
```
1. POST /api/courses
   → Create course with knowledgeText, concepts, accessibility
   → Status: 'draft'

2. POST /api/courses/:id/outline
   → Frontend calls AI to generate outline
   → Backend stores outline in Course.outline
   → Status: 'outline-generated'

3. POST /api/courses/:id/slides
   → Frontend calls AI to generate slides
   → Backend creates Slide[] entities
   → Updates Course.slides (array of slideIds)
   → Status: 'slides-generated'

4. POST /api/courses/:id/agent
   → Backend creates Agent entity
   → Generates system prompt from course content
   → Returns configuration for ElevenLabs API call
   → Frontend completes ElevenLabs agent creation
   → Status: 'agent-created'

5. POST /api/courses/:id/publish
   → Status: 'published'
```

### **Agent Creation Flow**
```
1. POST /api/courses/:courseId/agent
   → Backend creates Agent record in KV
   → Generates system prompt from course
   → Compiles course context (all slides, outline)
   → Returns agent config

2. Frontend calls ElevenLabs API:
   POST https://api.elevenlabs.io/v1/convai/agents
   → Creates actual conversational agent

3. PATCH /api/agents/:id/status
   → Updates agent status to 'active'
   → Stores ElevenLabs agent ID
```

### **Student Learning Flow**
```
1. POST /api/sessions
   → Create learning session for course
   → Initializes progress tracking

2. GET /api/courses/:courseId/slides
   → Fetch slides for presentation

3. During learning:
   - PATCH /api/sessions/:id/progress
     → Track slide navigation
   - POST /api/interactions
     → Record questions, highlights, etc.
   - GET /api/courses/:courseId/agent
     → Get agent configuration for chat

4. POST /api/sessions/resume-or-create
   → Resume existing session or create new
```

---

## 🌐 API Structure

### **User Management**
- CRUD operations for users
- Role-based filtering (teacher/student)
- Index-based lookups (email, username)

### **Course Management**
- Full CRUD with status workflow
- Filtering by teacher, status, public visibility
- Outline and slides management endpoints
- Publishing workflow

### **Slide Management**
- Individual slide CRUD
- Batch operations
- Reordering
- Duplication
- Query by course, outline node, position

### **Agent Management**
- Create/update/delete agents
- Status management
- Knowledge refresh from course updates
- Statistics and readiness checks
- Lookup by ElevenLabs ID

### **Session Management**
- Create/resume sessions
- Progress tracking
- Status updates (active/paused/completed)
- Query by student, course

### **Interaction Tracking**
- Record all interaction types
- Query by session, slide, student
- Statistics and summaries
- Feedback collection

### **Transcription**
- Audio file upload → text
- Purpose-based filtering
- Auto-expiration (24h TTL)

---

## 🔑 Storage Strategy: KV Key Patterns

The backend uses **structured KV key patterns** for efficient indexing:

```
Users:
├── user:{userId}
├── email_idx:{email}
├── username_idx:{username}
└── role_idx:{role}:{userId}

Courses:
├── course:{courseId}
├── teacher_courses:{teacherId}:{courseId}
├── public_courses:{courseId}
└── course_by_status:{status}:{courseId}

Slides:
├── slide:{slideId}
├── course_slides:{courseId}:{order}
└── slide_order:{courseId} → JSON array

Agents:
├── agent:{agentId}
└── course_agent:{courseId} → 1:1 lookup

Sessions:
├── session:{sessionId}
├── student_sessions:{studentId}:{sessionId}
├── active_session:{studentId}:{courseId}
└── course_sessions:{courseId}:{sessionId}

Interactions:
├── interaction:{interactionId}
├── session_interactions:{sessionId}:{timestamp}
└── student_questions:{studentId}:{interactionId}

Transcriptions:
├── transcription:{transcriptionId} (with TTL)
└── user_transcriptions:{userId}:{transcriptionId}
```

---

## 🤖 ElevenLabs Integration Points

### **1. Conversational Agents**
- **Endpoint**: `POST /api/courses/:courseId/agent`
- Backend prepares:
  - System prompt (generated from course content)
  - Voice ID
  - First message
  - Course context
- Frontend completes creation via ElevenLabs API
- Backend stores ElevenLabs agent ID for future reference

### **2. Speech-to-Text**
- **Endpoint**: `POST /api/transcribe`
- Accepts audio file uploads
- TODO: Integrate with ElevenLabs STT API (currently placeholder)
- Returns transcribed text

### **Current Integration Status**
- ✅ Agent configuration management (backend ready)
- ✅ Agent metadata storage
- ⏳ ElevenLabs API calls (frontend handles actual API calls)
- ⏳ Speech-to-Text integration (placeholder in backend)

---

## 🎯 Key Features

### **For Teachers**
1. Create courses from natural language input
2. Generate structured course outlines (AI-powered)
3. Generate slides automatically (AI-powered)
4. Create voice-enabled AI teaching agents
5. Track course analytics (students, sessions, interactions)
6. Manage course visibility (public/private)

### **For Students**
1. Browse available courses
2. Start/resume learning sessions
3. Interact with AI agent (voice conversations)
4. Navigate slides with agent guidance
5. Ask questions and get answers
6. Highlight and annotate content
7. Track learning progress

### **System Features**
1. Multi-modal accessibility (visual, auditory, kinesthetic, reading)
2. Progress tracking and analytics
3. Interaction logging for insights
4. Auto-expiring transcriptions (24h)
5. Resume session functionality
6. Course status workflow management

---

## 🔐 Authentication & Security

- CORS configuration in `_app/cors.ts`
- Auth setup in `_app/auth.ts` (implementation depends on your auth provider)
- Environment variables via Raindrop framework

---

## 📦 Development

### **Local Setup**
```bash
npm install
npm run start    # Runs with Raindrop framework
npm run build    # TypeScript compilation
```

### **Deployment**
- Uses Raindrop framework for Cloudflare Workers deployment
- Manifest file (`raindrop.manifest`) defines services

---

## 🔮 Design Decisions

1. **KV over SQL**: Chosen for simplicity, scalability, and Cloudflare edge benefits
2. **Embedded Outline**: Outline stored in Course (not separate entity) for atomic updates
3. **1:1 Agent-Course**: Each course has exactly one agent
4. **Session-based Learning**: Discrete learning sessions with progress tracking
5. **Interaction Logging**: Comprehensive logging for analytics and improvement
6. **Progressive Course Creation**: 4-step workflow ensures data consistency

---

## 🚧 Current Status & TODOs

### **Completed**
- ✅ All core data models
- ✅ Repository layer (KV operations)
- ✅ REST API endpoints for all entities
- ✅ Agent configuration management
- ✅ Session and interaction tracking
- ✅ Transcription service structure

### **Pending/In Progress**
- ⏳ Actual ElevenLabs API integration (frontend may handle)
- ⏳ Speech-to-Text implementation (placeholder exists)
- ⏳ Authentication implementation details
- ⏳ Error handling refinement
- ⏳ Analytics aggregation endpoints

---

## 📝 API Documentation

The README.md contains comprehensive API documentation with:
- All endpoint definitions
- Request/response examples
- Data model schemas
- KV key structure details

For the complete API reference, see `README.md` lines 13-102.

---

This backend provides a complete foundation for your frontend AI slide reader application, handling all data persistence, business logic, and integration points with ElevenLabs for conversational AI capabilities.

