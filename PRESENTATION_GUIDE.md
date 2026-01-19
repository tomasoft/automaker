# Automaker Presentation Guide

> **Autonomous AI Development Studio**  
> Build software 10x faster by orchestrating AI agents instead of writing code manually

---

## 🎯 Executive Summary

Automaker transforms how you build software by letting you **direct AI agents** rather than manually coding every line. Describe features on a Kanban board, and watch AI agents powered by Claude Agent SDK automatically implement them—complete with real-time streaming, git worktree isolation, plan approval, and multi-agent task execution.

**Key Value Proposition:** The future of software development is agentic coding—Automaker puts it in your hands today.

---

## 🌟 Top 10 Features to Highlight

### 1. **AI-Powered Kanban Board** ⭐

**What it does:**

- Visual drag-and-drop interface to manage features through 4 stages: Backlog → In Progress → Waiting Approval → Verified
- AI agents automatically assigned when you move a feature to "In Progress"
- Real-time streaming shows agents working live with tool usage and progress updates

**Demo value:** This is the core workflow—very visual and impressive. Show dragging a card and watching the agent start working immediately.

**Technical highlight:** Built with dnd-kit for smooth drag-and-drop, React 19 for performance, Zustand for state management

---

### 2. **Git Worktree Isolation** 🔒

**What it does:**

- Each feature runs in an isolated git worktree
- Main branch stays protected during development
- No conflicts between multiple features being worked on simultaneously
- Easy PR creation directly from worktrees

**Demo value:** Shows enterprise-ready safety features. Demonstrate multiple features running in parallel without interfering with each other.

**Technical highlight:** Uses `@automaker/git-utils` library with node-pty for terminal integration

---

### 3. **Intelligent Planning Modes** 🧠

**Four levels of planning:**

- **Skip:** Direct implementation (fast iteration)
- **Lite:** Quick plan generation (balanced)
- **Spec:** Full task breakdown with multi-agent execution (quality focus)
- **Full:** Phased execution with milestones (complex features)

**Plan approval workflow:**

- AI generates plan first
- You review and approve before implementation
- Modify plans before execution

**Demo value:** Shows intelligent, controlled AI behavior. Demonstrate how spec mode spawns dedicated agents per task.

**Technical highlight:** Uses Claude Agent SDK for autonomous planning and task decomposition

---

### 4. **Skills & Wiki Integration** 📚

**What it does:**

- Auto-loads relevant technical documentation from Azure DevOps wikis
- SKILL.md files provide context to agents
- Similarity-based document selection using Jaccard algorithm
- Agents automatically reference team knowledge

**Demo value:** Shows how agents learn from your organization's knowledge base. No need to repeat context—agents find it automatically.

**Technical highlight:**

- OAuth 2.0 integration with Azure DevOps
- Automatic wiki caching and indexing
- Configurable similarity threshold (default: 0.3)
- Support for both global and project-specific skills

---

### 5. **Multi-Model Support** 🤖

**Supported providers:**

- **Claude (Anthropic):** Opus, Sonnet, Haiku
- **Cursor:** Auto, gpt-4o, o1, o3-mini, and more
- **GitHub Copilot:** GPT-4o, o1, o3-mini
- **Local LLMs:** Any OpenAI-compatible endpoint

**Extended Thinking Modes:**

- None, Medium, Deep, Ultra
- Configurable token budgets (3K to 100K tokens)
- Only for Claude models (Cursor handles internally)

**AI Profiles:**

- Create custom agent configurations
- Different prompts, models, and settings per profile
- Reusable across features

**Demo value:** Shows flexibility and cost optimization. Demonstrate using Haiku for quick tasks, Opus for complex features.

**Technical highlight:** Phase-specific model configuration—use different models for enhancement vs. implementation

---

### 6. **Feature Dependencies & Graph View** 🔗

**What it does:**

- Features can block on other features
- Interactive graph visualization shows dependency tree
- Enforced execution order prevents premature implementation
- Automatic dependency resolution

**Demo value:** Shows sophisticated project management. Display the graph view with a complex dependency chain.

**Technical highlight:** Uses `@automaker/dependency-resolver` library with @xyflow/react for visualization

---

### 7. **Integrated Development Environment** 🖥️

**Components:**

- **Full terminal access** with tabs, splits, and persistent sessions
- **Code diff viewer** for reviewing agent changes
- **Real-time tool usage streaming** showing what agents are doing
- **Image support** for attaching screenshots and diagrams
- **Context management** for markdown docs and resources

**Demo value:** Shows complete development environment. Demonstrate split terminal view while agent works.

**Technical highlight:** Uses xterm.js for terminal emulation, CodeMirror 6 for syntax highlighting

---

### 8. **GitHub Integration** 📋

**Features:**

- Import issues automatically from GitHub
- AI validates issue feasibility
- Converts issues to implementation tasks
- Links back to original GitHub issues

**Demo value:** Shows real-world workflow integration. Import a GitHub issue and watch it become a feature.

**Technical highlight:** Direct GitHub API integration with OAuth support

---

### 9. **Cross-Platform Deployment** 💻

**Desktop app:**

- **macOS:** x64 + arm64 (DMG + ZIP)
- **Windows:** x64 (NSIS installer)
- **Linux:** x64 (AppImage + DEB)

**Web mode:**

- Run in browser at localhost:3007
- No installation required

**Docker deployment:**

- Security-first with container isolation
- No host filesystem access by default
- Production-ready configuration

**Demo value:** Shows enterprise deployment flexibility. Demonstrate switching between desktop and web modes.

**Technical highlight:** Built with Electron 39, Vite 7, and Docker Compose

---

### 10. **Enterprise Security & Compliance** 🔐

**Security features:**

- **Docker isolation:** Complete filesystem sandboxing
- **API authentication:** Optional AUTOMAKER_API_KEY
- **CORS policies:** Configurable origins
- **Directory restrictions:** ALLOWED_ROOT_DIRECTORY setting
- **Credential management:** Separate encrypted storage

**Audit & tracking:**

- Complete session history with chat logs
- Usage tracking for Claude API calls
- Git commit history for all changes
- Agent decision logging

**Demo value:** Shows enterprise-ready security. Demonstrate Docker deployment and API authentication.

**Technical highlight:** Multi-layer security with platform-specific safeguards

---

## 🚀 Demo Flow Suggestion

### 1. **Introduction** (2 minutes)

- Show the Kanban board
- Explain the workflow: Backlog → In Progress → Waiting Approval → Verified

### 2. **Create a Feature** (3 minutes)

- Click "Add Feature" button
- Fill in description with images/screenshots
- Select model (show different options)
- Choose planning mode (demonstrate Spec mode)
- Show skills auto-matching

### 3. **Watch AI Agent Work** (5 minutes)

- Drag feature to "In Progress"
- Watch real-time streaming
- Show terminal output
- Demonstrate follow-up instructions
- Show git worktree created

### 4. **Review & Approve** (2 minutes)

- Feature moves to "Waiting Approval"
- Review git diff
- Show changes made
- Approve and merge

### 5. **Advanced Features** (3 minutes)

- Show dependency graph
- Demonstrate multiple features running concurrently
- Show settings with model defaults
- Display AI profiles
- Show Azure DevOps wiki integration

---

## 📊 Key Statistics & Metrics

### Performance

- **Concurrent execution:** Up to 10 features simultaneously (configurable)
- **Hot reload:** Vite dev server with instant updates
- **Build time:** Full build in under 2 minutes

### Scalability

- **Projects:** Unlimited
- **Features per project:** Tested with 500+
- **Context files:** Up to 100 MB per feature
- **Images:** Unlimited per feature description

### Supported Technologies

- **Node.js:** 22+ (tested with latest LTS)
- **Package manager:** npm workspaces
- **Monorepo:** 10 shared libraries
- **Testing:** Vitest + Playwright

---

## 💡 Use Cases

### 1. **Rapid Prototyping**

Create MVPs in days instead of weeks by letting AI handle boilerplate and implementation

### 2. **Legacy Modernization**

Break down large refactoring tasks into AI-managed chunks with dependency tracking

### 3. **Documentation-First Development**

Use Azure DevOps wiki integration to ensure agents follow team standards

### 4. **Educational Projects**

Learn by watching AI implement features step-by-step with full transparency

### 5. **Team Collaboration**

Multiple developers orchestrating AI agents on different features simultaneously

---

## 🎨 UI/UX Highlights

### Theming

- **25+ themes** including Dark, Light, Dracula, Nord, Catppuccin, Tokyo Night, and more
- Smooth animations and transitions
- Responsive design for all screen sizes

### Customization

- **Fully customizable shortcuts** for all actions
- Configurable keyboard navigation
- Audio notifications (mutable)

### Accessibility

- Built on Radix UI primitives
- ARIA-compliant components
- Keyboard-first navigation

---

## 🛠️ Tech Stack Highlights

### Frontend Innovation

- **React 19:** Latest stable release
- **Vite 7:** Next-gen build tool
- **TanStack Router:** File-based routing
- **Tailwind CSS 4:** Utility-first styling

### Backend Robustness

- **Express 5:** Modern HTTP server
- **WebSocket (ws):** Real-time streaming
- **Claude Agent SDK:** Official Anthropic integration
- **node-pty:** Native terminal sessions

### Quality Assurance

- **Playwright:** E2E testing
- **Vitest:** Fast unit testing
- **ESLint 9:** Latest linting
- **Prettier 3:** Code formatting
- **Husky:** Git hooks

---

## 🔮 Future Vision

### Agentic Coding Revolution

Automaker represents the future where developers become **architects** directing AI agents rather than manual coders. Key trends:

- **10x productivity:** Build in days what used to take weeks
- **Democratization:** Non-developers can build sophisticated software
- **Quality improvement:** AI handles boilerplate, humans focus on business logic
- **Continuous learning:** Agents improve with your organization's knowledge

### Roadmap Highlights

- Multi-agent collaboration with role specialization
- Natural language project generation
- Automated testing and QA agents
- Performance optimization agents
- Security scanning agents

---

## 📋 Common Questions & Answers

### Q: How much does it cost?

**A:** Automaker is free and open-source. You only pay for Claude API usage (bring your own Anthropic API key or use Claude Code CLI).

### Q: Does it work offline?

**A:** Yes, with Local LLM support. Connect any OpenAI-compatible endpoint.

### Q: Can I use it for commercial projects?

**A:** Yes, MIT license allows commercial use.

### Q: How secure is it?

**A:** Docker deployment provides complete isolation. All credentials stored separately from project data.

### Q: What languages does it support?

**A:** Language-agnostic—works with any programming language that Claude understands.

### Q: Can it replace developers?

**A:** No, it **augments** developers. You still make architectural decisions, review code, and approve changes.

---

## 🎯 Closing Points

1. **Automaker is production-ready** with enterprise security and reliability
2. **Open-source community** welcomes contributions
3. **Extensive documentation** for quick onboarding
4. **Active Discord community** for support and collaboration
5. **Built by engineers using AI** as proof-of-concept for agentic coding

---

## 🔗 Resources

- **GitHub:** https://github.com/AutoMaker-Org/automaker
- **Discord:** https://discord.gg/jjem7aEDKU
- **Agentic Jumpstart Course:** https://agenticjumpstart.com/?utm=automaker-gh
- **Claude Agent SDK:** https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk

---

**Good luck with your presentation! 🚀**

_For questions or issues, refer to the comprehensive README.md and documentation in the /docs folder._
