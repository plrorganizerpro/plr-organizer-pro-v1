# PLR Organizer Pro - Developer Documentation

## Table of Contents
1. [Project Structure](#project-structure)
2. [Development Environment Setup](#development-environment-setup)
3. [Development Workflow](#development-workflow)
4. [Building for Production](#building-for-production)
5. [IPC Communication](#ipc-communication)
6. [Feature Development Guide](#feature-development-guide)
7. [Debugging Guide](#debugging-guide)
8. [Common Issues](#common-issues)
9. [Architecture Decisions](#architecture-decisions)
10. [Contributing Guidelines](#contributing-guidelines)

## Project Structure

```
plr-organizer-pro/
├── electron/              # Electron-specific code
│   ├── main/             # Main process code
│   │   ├── index.ts      # Entry point
│   │   ├── ipcHandlers.ts
│   │   ├── fileWatcher.ts
│   │   ├── autoUpdater.ts
│   │   └── menu.ts
│   ├── preload/          # Preload scripts
│   │   └── index.ts
│   └── shared/           # Shared types
│       └── types.ts
├── src/                  # React application
│   ├── components/       # UI components
│   ├── services/         # Business logic
│   ├── context/         # React context
│   └── pages/           # Route components
├── build/               # Build configuration
└── public/             # Static assets
```

## Development Environment Setup

### Prerequisites
```bash
# Required software
node >= 20.0.0
npm >= 9.0.0
git >= 2.30.0

# Required VS Code extensions
- ESLint
- Prettier
- Electron Tools
- SQLite Viewer
```

### Initial Setup
```bash
# Clone repository
git clone https://github.com/smarthome9953/plr-organizer-pro-v1.git
cd plr-organizer-pro-v1

# Install dependencies
npm install

# Setup development environment
npm run setup:dev
```

### Environment Variables
Create `.env.development`:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key
```

## Development Workflow

### Running in Development Mode
```bash
# Start in development mode
npm run dev

# With devtools
npm run dev:debug
```

### Code Style
- ESLint configuration in `.eslintrc.js`
- Prettier configuration in `.prettierrc`
- TypeScript configuration in `tsconfig.json`

### Git Workflow
1. Create feature branch: `feature/description`
2. Make changes and commit
3. Push and create PR
4. Wait for CI checks
5. Request review

## Building for Production

### Build Configuration
Configuration in `electron-builder.json`:
```json
{
  "appId": "com.plrorganizerpro.app",
  "productName": "PLR Organizer Pro",
  "directories": {
    "output": "dist"
  },
  "files": ["build/**/*", "node_modules/**/*"],
  "win": {
    "target": ["nsis"],
    "icon": "build/icon.ico"
  },
  "mac": {
    "target": ["dmg"],
    "icon": "build/icon.icns"
  },
  "linux": {
    "target": ["AppImage"],
    "icon": "build/icon.png"
  }
}
```

### Build Commands
```bash
# Build for current platform
npm run build

# Platform-specific builds
npm run build:win
npm run build:mac
npm run build:linux

# Build all platforms
npm run build:all
```

## IPC Communication

### Available Channels

#### File Operations
```typescript
// Main process (electron/main/ipcHandlers.ts)
ipcMain.handle('selectFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

// Renderer process (src/services/fileSystem.ts)
const selectFolder = async () => {
  return window.electron.invoke('selectFolder');
};
```

#### Database Operations
```typescript
interface DBOperations {
  addFile: (file: PLRFile) => Promise<void>;
  getFiles: () => Promise<PLRFile[]>;
  updateFile: (file: PLRFile) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
}
```

#### Cloud Sync
```typescript
interface SyncOperations {
  syncToCloud: () => Promise<void>;
  syncFromCloud: () => Promise<void>;
  getSyncStatus: () => Promise<SyncStatus>;
}
```

### Security Considerations
- Validate all IPC inputs
- Use typed channels
- Sanitize file paths
- Handle errors gracefully

## Feature Development Guide

### Adding New Features

1. **Plan the Feature**
   - Define requirements
   - Design UI/UX
   - Plan data flow
   - Consider offline support

2. **Implementation Steps**
   ```typescript
   // 1. Add types (shared/types.ts)
   interface NewFeature {
     id: string;
     data: unknown;
   }

   // 2. Add IPC handlers (main/ipcHandlers.ts)
   ipcMain.handle('newFeature', async (event, data) => {
     // Implementation
   });

   // 3. Add preload bridge (preload/index.ts)
   contextBridge.exposeInMainWorld('electron', {
     newFeature: (data) => ipcRenderer.invoke('newFeature', data)
   });

   // 4. Add UI components (src/components)
   const NewFeatureComponent: React.FC = () => {
     // Implementation
   };
   ```

3. **Testing**
   - Unit tests
   - Integration tests
   - E2E tests
   - Manual testing

### Example: Adding File Export Feature

```typescript
// 1. Types
interface ExportOptions {
  format: 'csv' | 'json';
  fields: string[];
}

// 2. IPC Handler
ipcMain.handle('exportFiles', async (event, options: ExportOptions) => {
  // Implementation
});

// 3. UI Component
const ExportButton: React.FC = () => {
  const handleExport = async () => {
    await window.electron.invoke('exportFiles', {
      format: 'csv',
      fields: ['name', 'path', 'size']
    });
  };
  
  return <Button onClick={handleExport}>Export</Button>;
};
```

## Debugging Guide

### Main Process Debugging
1. Launch with `--inspect` flag
2. Open Chrome DevTools
3. Connect to Node process

### Renderer Process Debugging
1. Open DevTools (Ctrl+Shift+I)
2. Use React DevTools
3. Check Console for errors

### Common Debug Scenarios

#### IPC Communication Issues
```typescript
// Enable debug logging
ipcMain.on('channel', (event, data) => {
  console.log('Received:', { channel: 'channel', data });
  // Handle event
});
```

#### Database Issues
```typescript
// SQL query logging
const db = new Database({
  debug: true,
  onQuery: (sql, params) => {
    console.log('SQL:', sql, 'Params:', params);
  }
});
```

## Common Issues

### Installation Problems
- Clear npm cache
- Check node version
- Verify dependencies

### Build Issues
- Check electron-builder config
- Verify code signing
- Clean build directory

### Runtime Issues
- Check logs
- Verify permissions
- Test IPC communication

## Architecture Decisions

### Technology Choices

#### Electron
- Cross-platform support
- Native capabilities
- Web technologies

#### React
- Component reuse
- State management
- Developer ecosystem

#### SQLite
- Offline support
- Fast queries
- Simple setup

### Design Patterns

#### IPC Bridge Pattern
```typescript
// Safe IPC communication
contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, data: unknown) => {
    const validChannels = ['channel1', 'channel2'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    throw new Error('Invalid channel');
  }
});
```

#### Repository Pattern
```typescript
// Database access
class FileRepository {
  async add(file: PLRFile): Promise<void> {
    // Implementation
  }
  
  async get(id: string): Promise<PLRFile> {
    // Implementation
  }
  
  async update(file: PLRFile): Promise<void> {
    // Implementation
  }
}
```

## Contributing Guidelines

### Code Style
- Follow ESLint rules
- Write TypeScript
- Document public APIs
- Add unit tests

### Pull Request Process
1. Create feature branch
2. Update documentation
3. Add tests
4. Create PR
5. Address reviews

### Commit Messages
```
feat: Add new feature
fix: Fix bug
docs: Update documentation
test: Add tests
chore: Update dependencies
```

### Testing Requirements
- Unit tests for utilities
- Integration tests for IPC
- E2E tests for workflows
- Performance benchmarks