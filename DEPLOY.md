# Deploying Office OS — GitHub & HuggingFace

Quick reference for pushing code to both GitHub and HuggingFace Spaces.

## Remotes

| Remote   | URL                                                      | Purpose            |
|----------|----------------------------------------------------------|---------------------|
| `origin` | https://github.com/bvsbharat/openenv-hack-hackathon.git | Upstream repo       |
| `myfork` | https://github.com/Hjhirp/SuperOffice_env.git            | Your GitHub fork    |
| `hf`     | https://huggingface.co/spaces/HarshalH/office_os         | HuggingFace Space   |

## Push to GitHub

### Push current branch to your fork
```bash
git push myfork HEAD
```

### Push current branch to upstream (origin)
```bash
git push origin HEAD
```

### Push a specific branch
```bash
git push myfork feature/mac-local-qwen
git push origin feature/mac-local-qwen
```

### Create a PR against upstream main
```bash
gh pr create --repo bvsbharat/openenv-hack-hackathon \
  --base main --head feature/mac-local-qwen \
  --title "Add Mac-local Qwen inference via Ollama" \
  --body "Enables running the full simulation on MacBook Pro M4 with Qwen 3.5 0.8B via Ollama."
```

## Push to HuggingFace Space

> **Why clone-fresh?** The HF Space history diverged from the GitHub repo.
> Direct push won't work. Instead: clone HF, copy files in, commit, push.

### One-shot deploy script
```bash
# 1. Clone the HF Space into a temp directory
TMPDIR=$(mktemp -d)
git clone https://huggingface.co/spaces/HarshalH/office_os "$TMPDIR/hf-space"

# 2. Remove old files (keep .git)
cd "$TMPDIR/hf-space"
find . -maxdepth 1 ! -name '.git' ! -name '.' -exec rm -rf {} +

# 3. Copy current project files (excluding .git, .venv, node_modules, __pycache__)
rsync -av --exclude='.git' \
          --exclude='.venv' \
          --exclude='node_modules' \
          --exclude='__pycache__' \
          --exclude='.env' \
          --exclude='*.pyc' \
          --exclude='demo/frontend/.vite' \
          /Users/harshalhirpara/Desktop/openenv-hack-hackathon/ .

# 4. Commit and push
git add -A
git commit -m "deploy: sync from $(git -C /Users/harshalhirpara/Desktop/openenv-hack-hackathon rev-parse --short HEAD)"
git push origin main

# 5. Cleanup
cd /Users/harshalhirpara/Desktop/openenv-hack-hackathon
rm -rf "$TMPDIR"
```

### Using the HF CLI (alternative)
```bash
# Install if needed
pip install huggingface_hub

# Login (one-time)
huggingface-cli login

# Upload the whole directory
huggingface-cli upload HarshalH/office_os . . --repo-type space \
  --exclude '.git/*' '.venv/*' 'node_modules/*' '__pycache__/*' '.env' '*.pyc'
```

## Push to Both (GitHub + HF)

```bash
# 1. Push to GitHub
git push myfork HEAD
git push origin HEAD

# 2. Deploy to HF Space
TMPDIR=$(mktemp -d)
git clone https://huggingface.co/spaces/HarshalH/office_os "$TMPDIR/hf-space"
cd "$TMPDIR/hf-space"
find . -maxdepth 1 ! -name '.git' ! -name '.' -exec rm -rf {} +
rsync -av --exclude='.git' --exclude='.venv' --exclude='node_modules' \
          --exclude='__pycache__' --exclude='.env' --exclude='*.pyc' \
          --exclude='demo/frontend/.vite' \
          /Users/harshalhirpara/Desktop/openenv-hack-hackathon/ .
git add -A
git commit -m "deploy: sync from $(git -C /Users/harshalhirpara/Desktop/openenv-hack-hackathon rev-parse --short HEAD)"
git push origin main
cd /Users/harshalhirpara/Desktop/openenv-hack-hackathon
rm -rf "$TMPDIR"
```

## Branch Strategy

| Branch                           | Purpose                                  |
|----------------------------------|------------------------------------------|
| `main`                           | Stable release                           |
| `improvements/office-os-v2`      | Current development                      |
| `feature/gstack-agent-improvements` | gstack-inspired prompt improvements   |
| `feature/mac-local-qwen`         | Mac-local Ollama + Qwen support          |
| `feature/hf-space-docker-deploy` | HF Space Docker config                  |

## Troubleshooting

**HF push rejected (diverged history):**
Always use the clone-fresh approach above. Never `git push hf` directly.

**GitHub auth issues:**
```bash
gh auth status       # Check GitHub CLI auth
gh auth login        # Re-authenticate
```

**HF auth issues:**
```bash
huggingface-cli whoami   # Check HF auth
huggingface-cli login    # Re-authenticate
```
