# Setting Up GitHub Personal Access Token (PAT)

## Step 1: Create a Personal Access Token on GitHub

1. Go to GitHub.com and sign in
2. Click your profile picture → **Settings**
3. Scroll down to **Developer settings** (bottom left)
4. Click **Personal access tokens** → **Tokens (classic)**
5. Click **Generate new token** → **Generate new token (classic)**
6. Give it a name (e.g., "Rendecrew Repo")
7. Set expiration (recommend 90 days or custom)
8. Select scopes:
   - ✅ **repo** (full control of private repositories) - this is the minimum needed
9. Click **Generate token**
10. **IMPORTANT**: Copy the token immediately - you won't see it again!

## Step 2: Use the PAT with Git

1. Configure Git to use macOS keychain:
   ```bash
   git config --global credential.helper osxkeychain
   ```

2. Update your remote URL to include your username (this helps ensure Git prompts correctly):
   ```bash
   git remote set-url origin https://YOUR_USERNAME@github.com/YOUR_USERNAME/YOUR_REPO.git
   ```
   Replace `YOUR_USERNAME` and `YOUR_REPO` with your actual values.

3. When you push, Git will prompt for credentials:
   - **Username**: Your GitHub username (should be pre-filled if you updated the remote URL)
   - **Password**: Paste your PAT (not your GitHub password)

4. macOS will save it in Keychain, so you won't need to enter it again.

## Step 3: Test Your Setup

Try pushing again:
```bash
git push origin main
```

## Troubleshooting

- **Token not working?** Make sure you selected the `repo` scope when creating the token

- **Credential helper not prompting for credentials?** Update your remote URL to explicitly include your username:
  ```bash
  git remote set-url origin https://YOUR_USERNAME@github.com/YOUR_USERNAME/YOUR_REPO.git
  ```
  Replace `YOUR_USERNAME` and `YOUR_REPO` with your actual values. This ensures Git knows which username to use and will prompt for the PAT.

- **Still asking for password or using old credentials?** Clear cached credentials from macOS Keychain:
  ```bash
  # Method 1: Clear via security command
  security delete-internet-password -s github.com
  
  # Method 2: Clear via git credential helper
  git credential-osxkeychain erase
  host=github.com
  protocol=https
  ```
  (For Method 2, press Enter twice after the last line)

- **Git not prompting at all?** Force terminal prompts:
  ```bash
  GIT_TERMINAL_PROMPT=1 git push origin main
  ```
