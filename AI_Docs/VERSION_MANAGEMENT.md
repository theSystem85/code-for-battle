> **Superseded (2026-10-18):** the version is now computed at build time from `package.json` plus `features/unreleased/**` entries, and `npm run release` creates releases. See the "Deployment" and "Versioning and release notes" sections of `AGENTS.md`. The scripts described below were removed.

# Automatic Version Management System

## Overview

This project uses an automated version management system that bumps the version number in `package.json` based on Git commit messages. The version is then displayed in the game's settings UI.

## How It Works

### 1. Commit Message-Based Version Bumping

When you make a commit, the system automatically analyzes your commit message **before the commit is finalized** and bumps the version. The version changes are included in the same commit.

**Process:**
1. You write your commit message
2. Git runs the `prepare-commit-msg` hook
3. The hook analyzes your message and bumps the version if it matches patterns
4. Updates `package.json` and regenerates `src/version.js`
5. Stages both files automatically
6. Your commit includes all changes + version bump in one atomic commit

**Version bumping rules:**

- **Patch version** (x.x.X): Bumped when commit message starts with:
  - `FIX` - Bug fixes
  - `REFACTOR` - Code refactoring

- **Minor version** (x.X.0): Bumped when commit message starts with:
  - `FEAT` - New features
  - `IMPROVE` - Improvements to existing features

- **No bump**: If the commit message doesn't match any pattern

### Examples

```bash
git commit -m "FIX: Resolved pathfinding bug"
# Version: 1.2.3 → 1.2.4

git commit -m "FEAT: Add new building type"
# Version: 1.2.4 → 1.3.0

git commit -m "REFACTOR: Optimize rendering pipeline"
# Version: 1.3.0 → 1.3.1

git commit -m "IMPROVE: Better AI decision making"
# Version: 1.3.1 → 1.4.0

git commit -m "docs: Update README"
# Version: 1.4.0 → 1.4.0 (no change)
```

### 2. Automatic Version File Generation

During build time (`npm run dev` or `npm run build`), the system:
1. Reads the version from `package.json`
2. Generates `src/version.js` with the current version
3. This file is imported by the game to display the version in the UI

### 3. Version Display

The version number is displayed in the game's **Map Settings** menu:
1. Click the gear icon (⚙) next to "Shuffle Map"
2. Expand the settings menu
3. See the version number at the bottom

## Files

### Scripts

- **`scripts/bump-version.js`**: Analyzes commit messages and updates `package.json`
- **`scripts/generate-version.js`**: Generates `src/version.js` from `package.json`

### Git Hook

- **`.git/hooks/prepare-commit-msg`**: Runs BEFORE commit is finalized, bumps version and includes changes in the same commit

**Why prepare-commit-msg and not post-commit?**
- `post-commit` runs AFTER the commit, requiring amendment which can cause recursion
- `prepare-commit-msg` runs BEFORE, allowing us to add files to the current commit atomically
- This prevents infinite loops and keeps version changes in a single commit

### Generated Files

- **`src/version.js`**: Auto-generated file containing `APP_VERSION` constant (now tracked in Git since it's part of commits)

## Manual Version Management

If you need to manually set the version:

```bash
# Edit package.json directly
# Change "version": "1.2.3" to your desired version

# Then regenerate version.js
npm run dev
# or
node scripts/generate-version.js
```

## Commit Message Best Practices

To ensure proper version bumping, start your commit messages with the appropriate prefix:

✅ **Good commit messages:**
- `FIX: Correct unit selection bug`
- `FEAT: Add new unit type - Artillery`
- `REFACTOR: Simplify pathfinding algorithm`
- `IMPROVE: Enhance minimap rendering`

❌ **Won't trigger version bump:**
- `fix bug` (lowercase)
- `Updated the readme`
- `WIP: Working on new feature`

## Integration Details

### package.json Scripts

```json
{
  "scripts": {
    "dev": "node scripts/generate-version.js && vite",
    "build": "node scripts/generate-version.js && vite build"
  }
}
```

### main.js Integration

```javascript
import { APP_VERSION } from './version.js'

// In setupMapSettings():
const versionElement = document.getElementById('appVersion')
if (versionElement) {
  versionElement.textContent = APP_VERSION
}
```

### HTML Display

```html
<div id="mapSettingsMenu" style="display:none;">
  <div style="font-size: 12px; color: #999;">
    <span>Version:</span>
    <span id="appVersion">-</span>
  </div>
</div>
```

## Troubleshooting

### Version not updating after commit

1. Check that the Git hook is executable:
   ```bash
   chmod +x .git/hooks/prepare-commit-msg
   ```

2. Verify the hook file exists:
   ```bash
   ls -la .git/hooks/prepare-commit-msg
   ```

3. Make sure your commit message starts with the correct prefix (FIX, FEAT, REFACTOR, IMPROVE)

### Recursion / Infinite Loop Issues

The original implementation used `post-commit` which caused recursion. The current implementation uses `prepare-commit-msg` which:
- Runs BEFORE the commit is finalized
- Adds version changes to the SAME commit
- Never causes recursion or infinite loops

If you experience issues:
```bash
# Remove any old hooks
rm -f .git/hooks/post-commit

# Ensure only prepare-commit-msg exists
ls -la .git/hooks/prepare-commit-msg
```

### Version not displaying in UI

1. Ensure `src/version.js` exists:
   ```bash
   node scripts/generate-version.js
   ```

2. Check browser console for import errors

3. Verify the game has been rebuilt/restarted after version changes

### Git hook not triggering

Make sure you're committing (not just staging):
```bash
git add .
git commit -m "FEAT: Your message"  # Hook runs here
```

## Architecture Notes

This system follows the project's conventions:
- ✅ ES6 modules with `.js` extensions
- ✅ Named exports (no default exports)
- ✅ Uses `prepare-commit-msg` hook to prevent recursion
- ✅ Version files are tracked in Git (part of atomic commits)
- ✅ Build-time generation also available for development
- ✅ No external dependencies required

**Key Design Decision:**
Using `prepare-commit-msg` instead of `post-commit` ensures:
- Single atomic commit with all changes
- No recursive hook triggers
- No git amendment needed
- Cleaner git history

## Future Enhancements

Possible improvements:
- Add support for major version bumps (breaking changes)
- Include build date/time in version info
- Add version history/changelog viewer in UI
- Support semantic versioning suffixes (-alpha, -beta, etc.)
