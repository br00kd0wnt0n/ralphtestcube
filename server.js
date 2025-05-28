const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Get port from environment variable or use 3002 as fallback
const PORT = process.env.PORT || 3002;

// Cache for file stats to reduce filesystem operations
const fileStatsCache = new Map();
const CACHE_TTL = 30000; // 30 second cache TTL
const FILESYSTEM_CHECK_INTERVAL = 5000; // Check filesystem every 5 seconds
const MAX_RETRIES = 5; // Maximum number of retries for file operations
const RETRY_DELAY = 1000; // Delay between retries in milliseconds
const CONTAINER_RESTART_THRESHOLD = 3; // Number of filesystem errors before considering container restart

// Track filesystem state
let lastFilesystemState = new Map();
let filesystemErrorCount = 0;
let lastContainerState = {
    timestamp: new Date().toISOString(),
    filesystemMounts: new Set(),
    fileCount: 0,
    errorCount: 0,
    restartCount: 0
};

// Function to check container filesystem state
async function checkContainerState() {
    const currentState = {
        timestamp: new Date().toISOString(),
        filesystemMounts: new Set(),
        fileCount: 0,
        errorCount: filesystemErrorCount,
        restartCount: lastContainerState.restartCount
    };

    try {
        // Check if we're in a container
        const isContainer = process.env.RAILWAY_WORKSPACE_DIR !== undefined;
        currentState.isContainer = isContainer;

        // Get filesystem mounts
        if (isContainer) {
            try {
                const mounts = await fs.promises.readFile('/proc/mounts', 'utf8');
                currentState.filesystemMounts = new Set(mounts.split('\n').map(line => line.split(' ')[1]));
            } catch (error) {
                console.error('Error reading container mounts:', error);
            }
        }

        // Check if filesystem mounts have changed
        const mountsChanged = !isEqualSets(currentState.filesystemMounts, lastContainerState.filesystemMounts);
        if (mountsChanged) {
            console.log('Container filesystem mounts changed:', {
                old: Array.from(lastContainerState.filesystemMounts),
                new: Array.from(currentState.filesystemMounts),
                timestamp: currentState.timestamp
            });
        }

        // Update container state
        lastContainerState = currentState;

        return {
            isHealthy: !mountsChanged && filesystemErrorCount < CONTAINER_RESTART_THRESHOLD,
            state: currentState
        };
    } catch (error) {
        console.error('Error checking container state:', error);
        return {
            isHealthy: false,
            state: currentState,
            error: error.message
        };
    }
}

// Helper function to compare Sets
function isEqualSets(a, b) {
    if (a.size !== b.size) return false;
    for (const item of a) if (!b.has(item)) return false;
    return true;
}

// Function to get file stats with caching and retry
async function getFileStats(filePath, retries = MAX_RETRIES) {
    const now = Date.now();
    const cached = fileStatsCache.get(filePath);
    
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
        return cached.stats;
    }
    
    for (let i = 0; i < retries; i++) {
        try {
            const stats = await fs.promises.stat(filePath);
            const containerState = await checkContainerState();
            
            fileStatsCache.set(filePath, {
                stats,
                timestamp: now,
                lastCheck: new Date().toISOString(),
                containerState: containerState.state
            });
            
            if (!containerState.isHealthy) {
                console.warn('Container state unhealthy during file stats:', {
                    filePath,
                    containerState: containerState.state,
                    timestamp: new Date().toISOString()
                });
            }
            
            return stats;
        } catch (error) {
            console.error(`Error getting file stats (attempt ${i + 1}/${retries}):`, {
                filePath,
                error: error.message,
                timestamp: new Date().toISOString(),
                containerState: lastContainerState
            });
            
            if (i === retries - 1) {
                filesystemErrorCount++;
                throw error;
            }
            
            // Check container state before retrying
            const containerState = await checkContainerState();
            if (!containerState.isHealthy) {
                console.error('Container state unhealthy, clearing cache:', {
                    containerState: containerState.state,
                    timestamp: new Date().toISOString()
                });
                fileStatsCache.clear();
            }
            
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
    return null;
}

// Function to verify file accessibility with retry and state tracking
async function verifyFileAccess(filePath, retries = MAX_RETRIES) {
    const currentState = {
        path: filePath,
        timestamp: new Date().toISOString(),
        attempts: 0,
        lastError: null
    };

    for (let i = 0; i < retries; i++) {
        currentState.attempts++;
        try {
            const stats = await getFileStats(filePath);
            if (!stats) {
                currentState.lastError = 'No stats available';
                continue;
            }
            
            // Check if file is readable
            await fs.promises.access(filePath, fs.constants.R_OK);
            
            // Update state tracking
            lastFilesystemState.set(filePath, {
                ...currentState,
                isAccessible: true,
                lastSuccess: new Date().toISOString()
            });
            
            return true;
        } catch (error) {
            currentState.lastError = error.message;
            console.error(`File access error (attempt ${i + 1}/${retries}):`, {
                ...currentState,
                error: error.message
            });
            
            if (i === retries - 1) {
                lastFilesystemState.set(filePath, {
                    ...currentState,
                    isAccessible: false,
                    lastError: error.message
                });
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
    return false;
}

// Function to check filesystem health with container awareness
async function checkFilesystemHealth() {
    const publicDir = path.join(__dirname, 'public');
    const backgroundsDir = path.join(publicDir, 'backgrounds');
    const healthState = {
        timestamp: new Date().toISOString(),
        directories: {},
        files: {},
        errors: [],
        recoveryAttempted: false,
        containerState: null
    };
    
    try {
        // Check container state first
        const containerState = await checkContainerState();
        healthState.containerState = containerState.state;
        
        console.log('Checking filesystem health...', {
            timestamp: healthState.timestamp,
            errorCount: filesystemErrorCount,
            containerState: containerState.state
        });
        
        if (!containerState.isHealthy) {
            healthState.errors.push('Container state unhealthy');
            console.error('Container state unhealthy:', {
                containerState: containerState.state,
                timestamp: new Date().toISOString()
            });
            
            // Consider container restart if too many errors
            if (filesystemErrorCount >= CONTAINER_RESTART_THRESHOLD) {
                console.error('Too many filesystem errors, container may need restart:', {
                    errorCount: filesystemErrorCount,
                    threshold: CONTAINER_RESTART_THRESHOLD,
                    timestamp: new Date().toISOString()
                });
                lastContainerState.restartCount++;
            }
            
            return false;
        }
        
        // Check public directory
        const publicStats = await getFileStats(publicDir);
        healthState.directories.public = {
            path: publicDir,
            exists: !!publicStats,
            isDirectory: publicStats?.isDirectory(),
            permissions: publicStats?.mode.toString(8),
            lastCheck: new Date().toISOString()
        };
        
        if (!publicStats || !publicStats.isDirectory()) {
            healthState.errors.push('Public directory is not accessible');
            return false;
        }
        
        // Check backgrounds directory
        const backgroundsStats = await getFileStats(backgroundsDir);
        healthState.directories.backgrounds = {
            path: backgroundsDir,
            exists: !!backgroundsStats,
            isDirectory: backgroundsStats?.isDirectory(),
            permissions: backgroundsStats?.mode.toString(8),
            lastCheck: new Date().toISOString()
        };
        
        if (!backgroundsStats || !backgroundsStats.isDirectory()) {
            healthState.errors.push('Backgrounds directory is not accessible');
            return false;
        }
        
        // Check all files with state tracking
        const files = await fs.promises.readdir(publicDir);
        for (const file of files) {
            const filePath = path.join(publicDir, file);
            const isAccessible = await verifyFileAccess(filePath);
            const stats = await getFileStats(filePath);
            
            healthState.files[file] = {
                path: filePath,
                isAccessible,
                size: stats?.size,
                permissions: stats?.mode.toString(8),
                lastCheck: new Date().toISOString(),
                state: lastFilesystemState.get(filePath)
            };
            
            console.log(`File ${file} accessibility:`, healthState.files[file]);
        }
        
        // Check for filesystem recovery
        if (filesystemErrorCount > 0) {
            console.log('Attempting filesystem recovery...', {
                errorCount: filesystemErrorCount,
                timestamp: new Date().toISOString()
            });
            
            // Clear cache and retry all files
            fileStatsCache.clear();
            for (const [filePath, state] of lastFilesystemState) {
                if (!state.isAccessible) {
                    await verifyFileAccess(filePath, MAX_RETRIES);
                }
            }
            
            healthState.recoveryAttempted = true;
            filesystemErrorCount = 0;
        }
        
        return true;
    } catch (error) {
        console.error('Filesystem health check failed:', {
            error: error.message,
            healthState,
            containerState: lastContainerState,
            timestamp: new Date().toISOString()
        });
        return false;
    }
}

// Start periodic filesystem health checks with container awareness
let checkInterval = FILESYSTEM_CHECK_INTERVAL;
setInterval(async () => {
    const isHealthy = await checkFilesystemHealth();
    if (!isHealthy) {
        console.error('Filesystem health check failed:', {
            timestamp: new Date().toISOString(),
            currentInterval: checkInterval,
            containerState: lastContainerState
        });
        
        fileStatsCache.clear();
        // Increase check frequency on failure
        checkInterval = Math.min(checkInterval * 1.5, 15000);
        
        // Log container state for debugging
        console.log('Container state after health check failure:', {
            containerState: lastContainerState,
            timestamp: new Date().toISOString()
        });
    } else {
        // Reset check frequency on success
        checkInterval = FILESYSTEM_CHECK_INTERVAL;
    }
}, checkInterval);

// Basic request logging with more details
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    console.log('Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        RAILWAY_WORKSPACE_DIR: process.env.RAILWAY_WORKSPACE_DIR,
        cwd: process.cwd(),
        __dirname: __dirname
    });
    next();
});

// Health check endpoint with more details
app.get('/health', async (req, res) => {
    try {
        const publicDir = path.join(__dirname, 'public');
        const indexPath = path.join(publicDir, 'index.html');
        
        console.log('Health check - Checking paths:');
        console.log('Public directory:', publicDir);
        console.log('Index path:', indexPath);
        
        // List files in public directory with stats and accessibility
        const publicFiles = await Promise.all((await fs.promises.readdir(publicDir)).map(async file => {
            const filePath = path.join(publicDir, file);
            const stats = await getFileStats(filePath);
            const isAccessible = await verifyFileAccess(filePath);
            return {
                name: file,
                size: stats?.size,
                permissions: stats?.mode.toString(8),
                isDirectory: stats?.isDirectory(),
                isAccessible,
                lastChecked: new Date().toISOString()
            };
        }));
        
        const backgroundFiles = await Promise.all((await fs.promises.readdir(path.join(publicDir, 'backgrounds'))).map(async file => {
            const filePath = path.join(publicDir, 'backgrounds', file);
            const stats = await getFileStats(filePath);
            const isAccessible = await verifyFileAccess(filePath);
            return {
                name: file,
                size: stats?.size,
                permissions: stats?.mode.toString(8),
                isAccessible,
                lastChecked: new Date().toISOString()
            };
        }));
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: {
                NODE_ENV: process.env.NODE_ENV,
                PORT: process.env.PORT,
                RAILWAY_WORKSPACE_DIR: process.env.RAILWAY_WORKSPACE_DIR,
                cwd: process.cwd(),
                __dirname: __dirname
            },
            paths: {
                public: publicDir,
                index: indexPath
            },
            files: {
                public: publicFiles,
                backgrounds: backgroundFiles
            },
            cache: {
                size: fileStatsCache.size,
                ttl: CACHE_TTL
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message,
            stack: error.stack
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        status: 'error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Enhanced static file middleware with state tracking
const staticMiddleware = async (req, res, next) => {
    const publicDir = path.join(__dirname, 'public');
    const requestedPath = req.path;
    const fullPath = path.join(publicDir, requestedPath);
    
    try {
        const isAccessible = await verifyFileAccess(fullPath);
        const state = lastFilesystemState.get(fullPath);
        
        console.log('Static file request:', {
            requestedPath,
            fullPath,
            exists: fs.existsSync(fullPath),
            isAccessible,
            state,
            cacheHit: fileStatsCache.has(fullPath),
            timestamp: new Date().toISOString()
        });

        if (isAccessible) {
            // File exists and is accessible, let express.static handle it
            return express.static(publicDir, {
                maxAge: '1h',
                etag: true,
                lastModified: true,
                setHeaders: (res, path) => {
                    // Add custom headers for monitoring
                    res.set('X-File-State', JSON.stringify(lastFilesystemState.get(path) || {}));
                    res.set('X-Filesystem-Health', filesystemErrorCount === 0 ? 'healthy' : 'degraded');
                }
            })(req, res, next);
        }
        
        // File doesn't exist or isn't accessible
        console.log('File not found or not accessible:', {
            requestedPath,
            fullPath,
            state,
            error: 'File not found or not accessible',
            timestamp: new Date().toISOString()
        });
        next();
    } catch (error) {
        console.error('Error in static middleware:', {
            error: error.message,
            requestedPath,
            fullPath,
            state: lastFilesystemState.get(fullPath),
            timestamp: new Date().toISOString()
        });
        next(error);
    }
};

app.use(staticMiddleware);

// Handle all other routes by serving index.html
app.get('*', async (req, res, next) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    try {
        const isAccessible = await verifyFileAccess(indexPath);
        
        console.log('Serving index.html for route:', {
            requestedPath: req.path,
            indexPath: indexPath,
            isAccessible,
            timestamp: new Date().toISOString()
        });
        
        if (!isAccessible) {
            return res.status(500).send('Error: index.html is not accessible');
        }
        
        res.sendFile(indexPath, {
            maxAge: '1h',
            etag: true,
            lastModified: true
        }, (err) => {
            if (err) {
                console.error('Error serving index.html:', err);
                next(err);
            }
        });
    } catch (error) {
        console.error('Error serving index.html:', error);
        next(error);
    }
});

// Start the server with error handling
const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log('Current directory:', process.cwd());
    console.log('Server directory:', __dirname);
    console.log('Public directory:', path.join(__dirname, 'public'));
    console.log('Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        RAILWAY_WORKSPACE_DIR: process.env.RAILWAY_WORKSPACE_DIR
    });
    
    // Initial filesystem health check
    await checkFilesystemHealth();
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Performing graceful shutdown...');
    server.close(() => {
        console.log('Server closed. Exiting process...');
        process.exit(0);
    });
});

server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
    }
}); 