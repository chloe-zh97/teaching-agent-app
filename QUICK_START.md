# 🚀 Quick Start Guide - Agent Workflow

## ✅ Setup Complete!

Your environment is now configured and ready to create AI agents!

---

## 📁 What's Been Set Up

✅ **ElevenLabs SDK installed** (`@elevenlabs/elevenlabs-js`)
✅ **API key configured** in `.dev.vars`
✅ **Security configured** (`.dev.vars` added to `.gitignore`)
✅ **All workflow files created** (prompt templates, ElevenLabs service, workflows)

---

## 🎯 Start the Server

```bash
# Make sure you're in the project directory
cd "/Users/shluo03/Desktop/ai champion/teaching-agent-app"

# Start the development server
npm run start
```

The server will start on: **http://localhost:8787**

---

## 🧪 Test Agent Creation (Step-by-Step)

### Step 1: Create a Test User (Teacher)

```bash
curl -X POST http://localhost:8787/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@test.com",
    "username": "teacher01",
    "role": "teacher",
    "profile": {
      "firstName": "Test",
      "lastName": "Teacher"
    }
  }'
```

**Save the `userId` from the response!**

---

### Step 2: Create a Test Course

```bash
curl -X POST http://localhost:8787/api/courses \
  -H "Content-Type: application/json" \
  -d '{
    "teacherId": "PUT_USER_ID_HERE",
    "title": "Introduction to AI",
    "description": "Learn the fundamentals of artificial intelligence",
    "knowledgeText": "Artificial Intelligence (AI) is the simulation of human intelligence by machines. Key concepts include machine learning, neural networks, and deep learning. AI is used in applications like image recognition, natural language processing, and autonomous vehicles.",
    "concepts": ["machine learning", "neural networks", "deep learning", "AI applications"],
    "keywords": ["AI", "ML", "deep learning", "automation"],
    "accessibility": "visual",
    "isPublic": true
  }'
```

**Save the `courseId` from the response!**

---

### Step 3: Create Slides for the Course

```bash
curl -X POST http://localhost:8787/api/slides/batch \
  -H "Content-Type: application/json" \
  -d '{
    "slides": [
      {
        "courseId": "PUT_COURSE_ID_HERE",
        "order": 0,
        "title": "What is Artificial Intelligence?",
        "content": [
          {"type": "heading", "content": "Introduction to AI"},
          {"type": "bullet-points", "content": [
            "AI simulates human intelligence",
            "Used in many real-world applications",
            "Powered by machine learning and data"
          ]}
        ],
        "speakerNotes": "Introduce AI as simulation of human intelligence",
        "accessibilityMode": "visual",
        "layout": "content",
        "generatedBy": "teacher"
      },
      {
        "courseId": "PUT_COURSE_ID_HERE",
        "order": 1,
        "title": "Machine Learning Basics",
        "content": [
          {"type": "heading", "content": "What is Machine Learning?"},
          {"type": "text", "content": "Machine learning enables computers to learn from data without explicit programming."},
          {"type": "bullet-points", "content": [
            "Supervised learning - learns from labeled data",
            "Unsupervised learning - finds patterns in unlabeled data",
            "Reinforcement learning - learns through trial and error"
          ]}
        ],
        "speakerNotes": "Explain the three main types of machine learning",
        "accessibilityMode": "visual",
        "layout": "content",
        "generatedBy": "ai"
      },
      {
        "courseId": "PUT_COURSE_ID_HERE",
        "order": 2,
        "title": "Neural Networks",
        "content": [
          {"type": "heading", "content": "Building Blocks of Deep Learning"},
          {"type": "text", "content": "Neural networks are inspired by the human brain and consist of interconnected nodes (neurons)."},
          {"type": "bullet-points", "content": [
            "Input layer receives data",
            "Hidden layers process information",
            "Output layer produces results"
          ]}
        ],
        "speakerNotes": "Describe neural network architecture",
        "accessibilityMode": "visual",
        "layout": "content",
        "generatedBy": "ai"
      }
    ]
  }'
```

---

### Step 4: Create the AI Agent! 🎙️

```bash
curl -X POST http://localhost:8787/api/courses/PUT_COURSE_ID_HERE/agent \
  -H "Content-Type: application/json" \
  -d '{
    "teacherId": "PUT_USER_ID_HERE"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Agent created successfully",
  "agentId": "agent_...",
  "elevenLabsAgentId": "agent_...",
  "status": "created",
  "warnings": []
}
```

**This will take 5-10 seconds** while the workflow:
1. ✅ Fetches course and slides
2. ✅ Builds knowledge base (all slide content)
3. ✅ Generates teaching prompt (accessibility-aware)
4. ✅ Creates ElevenLabs agent via API
5. ✅ Stores everything in database

---

### Step 5: Verify Agent Was Created

```bash
# Get agent by course ID
curl http://localhost:8787/api/courses/PUT_COURSE_ID_HERE/agent
```

**Expected Response:**
```json
{
  "success": true,
  "agentId": "agent_...",
  "elevenLabsAgentId": "agent_...",
  "voiceId": "21m00Tcm4TlvDq8ikWAM",
  "status": "active",
  "data": {
    "agentId": "agent_...",
    "courseId": "course_...",
    "status": "active",
    "personality": {
      "name": "Introduction to AI - AI Tutor",
      "tone": "friendly"
    }
  }
}
```

---

## 🎉 Success!

You now have a **fully functional AI tutor** for your course!

### What Can This Agent Do?

- 📚 **Teaches course content** - Knows all 3 slides you created
- 🗣️ **Voice-enabled** - Students can have voice conversations
- 🎓 **Pedagogically sound** - Uses proper teaching strategies
- ♿ **Accessibility-aware** - Adapts to visual learning style
- 🧭 **Navigate slides** - Can guide students through material
- ❓ **Answer questions** - Based on course knowledge base

---

## 🔍 Check the Logs

While creating the agent, you should see beautiful formatted logs:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 AGENT CREATION WORKFLOW STARTED
   Course ID: course_...
   Teacher ID: teacher_...
   Voice ID: auto-select
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 [1/10] Validating course...
   ✓ Course found: "Introduction to AI"
🔍 [2/10] Checking for existing agent...
   ✓ No existing agent found
📄 [3/10] Fetching slides...
   ✓ Found 3 slides
📖 [4/10] Building knowledge base...
   ✓ Knowledge base built (2847 characters)
✔️  [5/10] Validating knowledge base quality...
   ✓ Knowledge base validated
💭 [6/10] Generating system prompt...
   ✓ System prompt generated (4521 characters)
⚙️  [7/10] Preparing agent configuration...
   ✓ Agent name: "Introduction to AI - AI Tutor"
   ✓ Voice ID: 21m00Tcm4TlvDq8ikWAM
🎙️  [8/10] Creating ElevenLabs agent...
   ✅ ElevenLabs agent created!
   Agent ID: agent_...
💾 [9/10] Storing agent metadata...
   ✓ Created new agent record: agent_...
📝 [10/10] Updating course record...
   ✓ Course updated with agent ID
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ AGENT CREATION WORKFLOW COMPLETED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🎯 Next Steps

### Test Other Endpoints:

**Refresh Agent Knowledge** (after updating slides):
```bash
curl -X POST http://localhost:8787/api/agents/PUT_AGENT_ID_HERE/refresh-knowledge
```

**Delete Agent** (cleanup):
```bash
curl -X DELETE http://localhost:8787/api/agents/PUT_AGENT_ID_HERE
```

**Recreate Agent** (change voice or start fresh):
```bash
curl -X POST http://localhost:8787/api/courses/PUT_COURSE_ID_HERE/agent \
  -H "Content-Type: application/json" \
  -d '{
    "teacherId": "PUT_USER_ID_HERE",
    "voiceId": "EXAVITQu4vr4xnSDxMaL",
    "recreate": true
  }'
```

---

## 📖 Full Documentation

For complete details, see:
- **`AGENT_WORKFLOW_SETUP.md`** - Comprehensive setup & testing guide
- **`INTEGRATION_SUMMARY.md`** - Frontend integration guide
- **Code comments** - Every file has detailed JSDoc comments

---

## 🐛 Troubleshooting

### Error: "ElevenLabs API key not configured"
- Check `.dev.vars` file exists in project root
- Verify it contains: `ELEVENLABS_API_KEY=7dd6394e701b7e8236102dfcfc426a19b84a4810577167ba829c5af9fc8bdfd4`
- Restart the server

### Error: "No slides found for course"
- Make sure you created slides (Step 3 above)
- Verify slides were created: `curl http://localhost:8787/api/courses/PUT_COURSE_ID_HERE/slides`

### Error: "Course not found"
- Check the course ID is correct
- Verify course exists: `curl http://localhost:8787/api/courses/PUT_COURSE_ID_HERE`

### Agent Creation Takes Too Long
- Normal! Creating an agent takes 5-10 seconds
- ElevenLabs API needs time to process the system prompt
- Check logs for progress

---

## 🎊 You're All Set!

Your teaching platform now has **AI-powered conversational tutors** that can:
- Teach course material through voice conversations
- Adapt to different learning styles
- Guide students through slides
- Answer questions intelligently
- Provide personalized learning experiences

**Happy teaching! 🎓**
