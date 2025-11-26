# Local Dev Setup
First time run the repo, install dependency
```bash
npm install
```

Run local
```bash
npm run start
```

# Design
## Data Model
**0 User**
```TypeScript
export enum UserRole {
  TEACHER = 'teacher',
  STUDENT = 'student',
}

export interface User {
  userId: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  profile?: {
    firstName?: string;
    lastName?: string;
    bio?: string;
    avatarUrl?: string;
  };
}

export interface CreateUserInput {
  email: string;
  username: string;
  role: UserRole;
  profile?: User['profile'];
}
```

KV
```bash
Users:
 ├── user:{userId}
 ├── email_idx:{email}
 ├── username_idx:{username}
 └── role_idx:{role}:{userId}
```

**1 Course**
```TypeScript
export interface Course {
  courseId: string;
  teacherId: string; // References User.userId
  
  // Basic Info
  title: string;
  description?: string;
  
  // Input from Teacher (Step 1)
  knowledgeText: string; // Original natural language input
  concepts: string[]; // Required concepts to cover
  keywords?: string[]; // Optional keywords for focus
  accessibility: 'visual' | 'auditory' | 'kinesthetic' | 'reading'; // Learning style
  
  // Generated Content (Steps 2-3)
  outline?: OutlineStructure; // Generated outline (embedded)
  slides: string[]; // Array of slideIds (ordered)
  
  // Agent Configuration (Step 4)
  agentId?: string; // ElevenLabs agent ID
  voiceId?: string; // ElevenLabs voice ID
  
  // Metadata
  status: 'draft' | 'outline-generated' | 'slides-generated' | 'agent-created' | 'published' | 'archived';
  isPublic: boolean;
  thumbnailUrl?: string;
  
  // Stats
  totalSlides: number;
  totalStudents: number;
  totalSessions: number;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
}

export interface CreateCourseInput {
  teacherId: string;
  title: string;
  description?: string;
  knowledgeText: string;
  concepts: string[];
  keywords?: string[];
  accessibility: Course['accessibility'];
}

export interface UpdateCourseOutlineInput {
  courseId: string;
  outline: OutlineStructure;
}

export interface UpdateCourseSlidesInput {
  courseId: string;
  slideIds: string[];
}
```

KV Keys:
- course:{courseId} → Course data
- teacher_courses:{teacherId}:{courseId} → Teacher's courses index
- public_courses:{courseId} → Public courses (if isPublic=true)
- course_by_status:{status}:{courseId} → Status-based filtering

**2 OutlineStructure**
```TypeScript
export interface OutlineNode {
  id: string;
  title: string;
  description: string;
  level: number; // Depth in hierarchy (1=main, 2=sub, etc.)
  children?: OutlineNode[]; // Nested structure
  estimatedDuration?: number; // minutes
  order: number; // Position in sequence
}

export interface OutlineStructure {
  nodes: OutlineNode[]; // Hierarchical array
  mermaidCode?: string; // For visualization
  generatedAt: Timestamp;
  generationPrompt?: string; // What was sent to Claude
}

// For API compatibility
export interface GenerateOutlineInput {
  knowledgeText: string;
  concepts: string[];
  accessibility: string;
  keywords?: string[];
}

export interface GenerateOutlineResponse {
  outline: OutlineStructure;
  success: boolean;
}
```
Note: Outline is embedded in Course, not a separate entity. This aligns with your API where outline is generated and immediately used.

**3 Slide (Individual Presentation Page)**
```TypeScript
export interface SlideContent {
  type: 'text' | 'heading' | 'bullet-points' | 'diagram' | 'image' | 'code' | 'quote';
  content: string | string[]; // String or array for bullet points
  style?: Record<string, any>; // Custom styling
}

export interface Slide {
  slideId: string;
  courseId: string;
  
  // Position
  order: number; // 0-indexed position in presentation
  
  // Content
  title: string;
  content: SlideContent[];
  speakerNotes?: string;
  
  // Related to outline
  outlineNodeId?: string; // Which outline section this covers
  
  // Accessibility-specific
  accessibilityMode: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  visualAids?: string[]; // URLs to images/diagrams
  audioNarration?: string; // Text for TTS or audio URL
  
  // Layout
  layout: 'title' | 'content' | 'two-column' | 'full-image' | 'diagram';
  theme?: string;
  
  // Generation metadata
  generatedAt: Timestamp;
  generatedFrom?: string; // Which outline node
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateSlideInput {
  courseId: string;
  order: number;
  title: string;
  content: SlideContent[];
  outlineNodeId?: string;
  accessibilityMode: string;
  layout?: string;
}

// For API compatibility
export interface GenerateSlidesInput {
  outline: OutlineNode[]; // Array format from frontend
  accessibility: string;
}

export interface GenerateSlidesResponse {
  slides: Slide[]; // Generated slides
  success: boolean;
}
```
KV Keys:
- slide:{slideId} → Slide data
- course_slides:{courseId}:{order} → Ordered slides for a course
- slide_order:{courseId} → JSON array of slideIds in order (for quick access)

**4 Agent (ElevenLabs Conversational Agent)**
```TypeScript
export interface Agent {
  agentId: string; // ElevenLabs agent ID
  courseId: string;
  teacherId: string;
  
  // ElevenLabs Configuration
  voiceId: string; // ElevenLabs voice ID
  conversationConfig?: Record<string, any>; // ElevenLabs settings
  
  // Knowledge Base
  systemPrompt: string; // Generated from course content
  courseContext: string; // Compiled knowledge
  slideReferences: string[]; // SlideIds for navigation
  
  // Capabilities
  canNavigateSlides: boolean;
  canAnswerQuestions: boolean;
  canProvideExamples: boolean;
  
  // Status
  status: 'creating' | 'active' | 'inactive' | 'error';
  errorMessage?: string;
  
  // Stats
  totalConversations: number;
  totalInteractions: number;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateAgentInput {
  courseId: string;
  teacherId: string;
  voiceId?: string; // Optional, defaults to standard voice
}

export interface CreateAgentResponse {
  agentId: string;
  voiceId: string;
  status: string;
}
```
KV Keys:
- agent:{agentId} → Agent data
- course_agent:{courseId} → Course's agent (1:1 relationship)

**5 Transcription**
```TypeScript
export interface Transcription {
  transcriptionId: string;
  userId: string; // Who requested it
  
  // Audio info
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  duration?: number; // seconds
  
  // Result
  text: string;
  confidence?: number;
  
  // Metadata
  createdAt: Timestamp;
  expiresAt: Timestamp; // Auto-delete after 24 hours
}

export interface TranscribeAudioInput {
  audioBuffer: Buffer;
  userId: string;
  filename: string;
}

export interface TranscribeAudioResponse {
  text: string;
  fileSize: number;
  mimeType: string;
}
```
KV Keys:
- transcription:{transcriptionId} → Transcription data (with TTL)
- user_transcriptions:{userId}:{transcriptionId} → User's recent transcriptions

Note: Use KV TTL (24 hours) to auto-delete old transcriptions.

**6 Session (Student Learning Session)**
```TypeScript
export interface SessionProgress {
  currentSlideOrder: number; // Current position (0-indexed)
  currentSlideId: string;
  visitedSlides: number[]; // Array of slide orders visited
  completedSlides: number[]; // Array of slide orders marked complete
  totalSlides: number;
  progressPercentage: number; // 0-100
}

export interface Session {
  sessionId: string;
  courseId: string;
  studentId: string;
  
  // Progress tracking
  progress: SessionProgress;
  
  // Timing
  startedAt: Timestamp;
  lastActivityAt: Timestamp;
  endedAt?: Timestamp;
  totalDuration: number; // seconds
  
  // Status
  status: 'active' | 'paused' | 'completed';
  
  // Interaction tracking
  totalQuestions: number;
  totalInteractions: number;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateSessionInput {
  courseId: string;
  studentId: string;
}

export interface UpdateSessionProgressInput {
  sessionId: string;
  currentSlideOrder: number;
  action: 'visit' | 'complete' | 'back' | 'forward';
}
```
KV Keys:

- session:{sessionId} → Session data
- student_sessions:{studentId}:{sessionId} → Student's sessions
- active_session:{studentId}:{courseId} → Currently active session
- course_sessions:{courseId}:{sessionId} → All sessions for a course

**7 Interation (Q&A, Navigation, Highlights)**
```TypeScript
export interface InteractionData {
  // Question/Answer
  question?: string;
  answer?: string;
  confidence?: number; // AI confidence 0-1
  
  // Navigation
  fromSlideOrder?: number;
  toSlideOrder?: number;
  
  // Highlight/Annotation
  highlightedText?: string;
  annotationText?: string;
  position?: { x: number; y: number };
  
  // Agent response
  agentResponse?: string;
  agentUsed: boolean;
}

export interface Interaction {
  interactionId: string;
  sessionId: string;
  courseId: string;
  studentId: string;
  slideOrder: number; // Which slide (position)
  
  // Type of interaction
  type: 'question' | 'navigation' | 'highlight' | 'annotation' | 'agent-chat';
  
  // Data
  data: InteractionData;
  
  // Feedback
  wasHelpful?: boolean;
  rating?: number; // 1-5
  
  // Timing
  timestamp: Timestamp;
  duration?: number; // How long on this interaction
  
  createdAt: Timestamp;
}

export interface CreateInteractionInput {
  sessionId: string;
  slideOrder: number;
  type: Interaction['type'];
  data: InteractionData;
}
```
KV Keys:
- interaction:{interactionId} → Interaction data
- session_interactions:{sessionId}:{timestamp} → Timeline of interactions
- student_questions:{studentId}:{interactionId} → Student's Q&A history

**8 Simplified Version Control**
```TypeScript
export interface CourseSnapshot {
  snapshotId: string;
  courseId: string;
  teacherId: string;
  
  // Snapshot data
  courseData: Partial<Course>;
  slidesData: Slide[];
  outlineData: OutlineStructure;
  
  // Metadata
  snapshotType: 'auto-save' | 'manual' | 'publish';
  description?: string;
  
  createdAt: Timestamp;
}
```
KV Keys:
- snapshot:{snapshotId} → Snapshot data
- course_snapshots:{courseId}:{timestamp} → Course history

## KV Key Structure
```bash
Users (Already implemented):
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
└── slide_order:{courseId}

Agents:
├── agent:{agentId}
└── course_agent:{courseId}

Transcriptions (with TTL):
├── transcription:{transcriptionId}
└── user_transcriptions:{userId}:{transcriptionId}

Sessions:
├── session:{sessionId}
├── student_sessions:{studentId}:{sessionId}
├── active_session:{studentId}:{courseId}
└── course_sessions:{courseId}:{sessionId}

Interactions:
├── interaction:{interactionId}
├── session_interactions:{sessionId}:{timestamp}
└── student_questions:{studentId}:{interactionId}

Snapshots (optional):
├── snapshot:{snapshotId}
└── course_snapshots:{courseId}:{timestamp}
```

## API Endpoint Mapping
**Course Routes**
```TypeScript
POST /api/generate-outline
→ Creates Course with outline embedded

POST /api/generate-slides  
→ Creates Slide[] and updates Course.slides

GET /api/courses
→ Lists courses (teacher_courses or public_courses)

GET /api/courses/:id
→ Gets Course + Slide[] + Agent
```

**Agent Routes**
```TypeScript
POST /api/courses/:id/create-agent
→ Creates Agent and updates Course.agentId

GET /api/courses/:id/agent
→ Gets Agent by course_agent:{courseId}
```

**Transcription Routes**
```TypeScript
POST /api/transcribe
→ Creates Transcription (with 24h TTL)
→ Returns text for course creation
```