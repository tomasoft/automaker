# 🖥️ Local LLM Setup Guide for AutoMaker

## ✅ What's Been Added

AutoMaker now supports **Local LLM providers** (LM Studio, Ollama, vLLM) for fully autonomous agents that run on your hardware!

### Features:

- ✅ **Full autonomous agent** capabilities (file creation, code execution)
- ✅ **Works with Azure DevOps** repos (no GitHub.com required)
- ✅ **Compliance-friendly** - code never leaves your infrastructure
- ✅ **No API costs** - one-time hardware investment
- ✅ **Privacy-first** - all processing happens locally

---

## 🚀 Quick Start with LM Studio

### Step 1: Download and Install LM Studio

1. Download from: https://lmstudio.ai/
2. Install and launch LM Studio

### Step 2: Download Your Model

You mentioned you're getting **Qwen2.5-Coder-30B Q4_K_M** - perfect choice!

In LM Studio:

1. Click the **Search** tab (🔍)
2. Search for: `qwen2.5-coder-30b`
3. Download the **Q4_K_M** quantization (good balance of quality/speed)
4. Wait for download to complete

### Step 3: Start the Local Server

1. Click the **Local Server** tab (🌐) in LM Studio
2. Select your downloaded model from the dropdown
3. Click **Start Server**
4. Server will start on: `http://localhost:1234`

### Step 4: Configure AutoMaker

No configuration needed! AutoMaker automatically connects to:

- **Endpoint:** `http://localhost:1234/v1`
- **Default model:** Will use whatever you loaded in LM Studio

---

## 🎯 Using Local LLM in AutoMaker

### For Text Enhancement (Already Works!):

1. Open **Add New Feature** dialog
2. Click **Model** tab
3. Select **Local LLM** provider
4. Choose your model (e.g., `Qwen2.5-Coder 32B`)
5. Use **"Enhance with AI"** button

### For Autonomous Agents (Make Button):

1. Create a feature
2. In the feature card, click **Model** dropdown
3. Select **Local LLM** → **Qwen2.5-Coder 32B**
4. Click **Make** ▶️
5. Review the plan
6. Click **Approve**
7. Watch the agent create files! 🤖

---

## 🔧 Advanced Configuration

### Custom Endpoint

If you're using a different port or server:

**Option 1: Environment Variable**

```bash
# Windows (PowerShell)
$env:LOCAL_LLM_ENDPOINT="http://localhost:8080/v1"

# Linux/Mac
export LOCAL_LLM_ENDPOINT="http://localhost:8080/v1"
```

**Option 2: .env File**

```env
LOCAL_LLM_ENDPOINT=http://localhost:8080/v1
LOCAL_LLM_MODEL=qwen2.5-coder-32b
```

### Using Ollama Instead

1. Install Ollama: https://ollama.ai/
2. Pull a model:
   ```bash
   ollama pull qwen2.5-coder:32b
   ```
3. Ollama automatically serves on: `http://localhost:11434/v1`
4. Set environment variable:
   ```bash
   $env:LOCAL_LLM_ENDPOINT="http://localhost:11434/v1"
   ```

### Using vLLM (Production)

1. Install vLLM:
   ```bash
   pip install vllm
   ```
2. Start server:
   ```bash
   python -m vllm.entrypoints.openai.api_server \
     --model Qwen/Qwen2.5-Coder-32B-Instruct \
     --port 8000
   ```
3. Set endpoint:
   ```bash
   $env:LOCAL_LLM_ENDPOINT="http://localhost:8000/v1"
   ```

---

## 💪 Hardware Requirements

### Your Current Setup (Qwen2.5-Coder-30B Q4_K_M):

- **Minimum VRAM:** 20GB (Q4_K_M quantization)
- **Recommended VRAM:** 24GB+ (RTX 4090, A5000)
- **RAM:** 32GB+
- **Performance:** Excellent for coding tasks!

### Other Model Options:

| Model                  | VRAM  | Speed     | Quality              | Use Case         |
| ---------------------- | ----- | --------- | -------------------- | ---------------- |
| **Qwen2.5-Coder-7B**   | 6GB   | ⚡ Fast   | ⭐⭐⭐ Good          | Quick tasks      |
| **Qwen2.5-Coder-14B**  | 10GB  | ⚡ Fast   | ⭐⭐⭐⭐ Great       | Balanced         |
| **Qwen2.5-Coder-32B**  | 20GB  | 🐢 Medium | ⭐⭐⭐⭐⭐ Excellent | **Your choice!** |
| **DeepSeek-Coder-33B** | 22GB  | 🐢 Medium | ⭐⭐⭐⭐⭐ Excellent | Alternative      |
| **CodeLlama-70B**      | 40GB+ | 🐌 Slow   | ⭐⭐⭐⭐⭐ Excellent | High-end         |

---

## 🧪 Testing Your Setup

### Test 1: Check Server Connection

1. Open AutoMaker
2. Go to **Settings → AI Providers**
3. Look for **Local LLM** status
4. Should show: ✅ **Connected** (if LM Studio is running)

### Test 2: Test Text Generation

1. Create a new feature
2. Enter a simple description: "Create a hello world function"
3. Click **Model** tab → **Local LLM** → **Qwen2.5-Coder 32B**
4. Click **"Enhance with AI"**
5. Should see enhanced description in ~5-10 seconds

### Test 3: Test Autonomous Agent

1. Keep the feature from Test 2
2. Click **Make** ▶️
3. Review the generated plan
4. Click **Approve**
5. Agent should start creating files!

---

## 🐛 Troubleshooting

### "Cannot connect to local LLM server"

- ✅ Check LM Studio is running
- ✅ Check server is started (green indicator in LM Studio)
- ✅ Check endpoint: http://localhost:1234/v1
- ✅ Try restarting LM Studio

### "No models loaded"

- ✅ Load a model in LM Studio's **Local Server** tab
- ✅ Wait for model to fully load (status bar shows "Ready")

### "Agent completes too fast / nothing created"

- ✅ Check logs for errors
- ✅ Ensure worktrees are disabled (Settings → Feature Defaults)
- ✅ Try a simpler feature first

### "Model is too slow"

- ✅ Use a smaller model (7B or 14B)
- ✅ Use Q4_K_M quantization (faster than Q5/Q6)
- ✅ Check GPU utilization in Task Manager
- ✅ Close other GPU-intensive applications

---

## 📊 Performance Expectations

### With Qwen2.5-Coder-30B Q4_K_M on RTX 4090:

- **Text Enhancement:** 5-10 seconds
- **Plan Generation:** 15-30 seconds
- **File Creation:** 30-60 seconds per file
- **Full Feature:** 2-5 minutes (depending on complexity)

### Comparison to Cloud:

- **Claude/GPT-4:** ~30-60 seconds total (faster)
- **Local LLM:** ~2-5 minutes total (slower but private!)

---

## 🎉 Success Checklist

- [ ] LM Studio installed and running
- [ ] Qwen2.5-Coder-30B Q4_K_M downloaded
- [ ] Local server started in LM Studio
- [ ] AutoMaker shows "Connected" for Local LLM
- [ ] Text enhancement works
- [ ] Autonomous agent creates files

---

## 🚀 Next Steps

1. **Test with a simple feature** (e.g., "Create a calculator class")
2. **Review the generated code** - check quality
3. **Try different models** - compare performance
4. **Present to management** - show the POC!
5. **Plan hardware upgrade** - if needed for production

---

## 💡 Tips for Best Results

1. **Be specific in feature descriptions** - the better the input, the better the output
2. **Start small** - test with simple features first
3. **Review plans carefully** - approve only what makes sense
4. **Monitor resource usage** - ensure GPU isn't overheating
5. **Keep models updated** - newer versions often perform better

---

## 📞 Need Help?

If you encounter issues:

1. Check the AutoMaker logs (in the UI)
2. Check LM Studio logs (in the app)
3. Verify your hardware meets requirements
4. Try a smaller model first

---

## 🎯 Your Setup Summary

```
✅ Model: Qwen2.5-Coder-30B Q4_K_M
✅ Server: LM Studio (http://localhost:1234)
✅ Use Case: Autonomous coding agent
✅ Compliance: ✅ Fully local, Azure DevOps compatible
✅ Hardware: Sufficient for 30B model
```

**You're all set! Start LM Studio and try your first autonomous feature!** 🚀
