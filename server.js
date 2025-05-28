const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Get port from environment variable or use 3002 as fallback
const PORT = process.env.PORT || 3002;

// Cache for file stats to reduce filesystem operations
const fileStatsCache = new Map();
const CACHE_TTL = 30000; // 30 second cache TTL
const FILESYSTEM_CHECK_INTERVAL = 15000; // Check filesystem every 15 seconds

// Function to get file stats with caching and retry
async function getFileStats(filePath, retries = 3) {
    const now = Date.now();
    const cached = fileStatsCache.get(filePath);
    
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
        return cached.stats;
    }
    
    for (let i = 0; i < retries; i++) {
        try {
            const stats = await fs.promises.stat(filePath);
            fileStatsCache.set(filePath, {
                stats,
                timestamp: now
            });
            return stats;
        } catch (error) {
            console.error(`Error getting file stats (attempt ${i + 1}/${retries}):`, {
                filePath,
                error: error.message
            });
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between retries
        }
    }
    return null;
}

// Function to verify file accessibility with retry
async function verifyFileAccess(filePath, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const stats = await getFileStats(filePath);
            if (!stats) return false;
            
            // Check if file is readable
            await fs.promises.access(filePath, fs.constants.R_OK);
            return true;
        } catch (error) {
            console.error(`File access error (attempt ${i + 1}/${retries}):`, {
                filePath,
                error: error.message
            });
            if (i === retries - 1) return false;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between retries
        }
    }
    return false;
}

// Function to check filesystem health
async function checkFilesystemHealth() {
    const publicDir = path.join(__dirname, 'public');
    const backgroundsDir = path.join(publicDir, 'backgrounds');
    
    try {
        console.log('Checking filesystem health...');
        
        // Check public directory
        const publicStats = await getFileStats(publicDir);
        if (!publicStats || !publicStats.isDirectory()) {
            console.error('Public directory is not accessible');
            return false;
        }
        
        // Check backgrounds directory
        const backgroundsStats = await getFileStats(backgroundsDir);
        if (!backgroundsStats || !backgroundsStats.isDirectory()) {
            console.error('Backgrounds directory is not accessible');
            return false;
        }
        
        // Check all files
        const files = await fs.promises.readdir(publicDir);
        for (const file of files) {
            const filePath = path.join(publicDir, file);
            const isAccessible = await verifyFileAccess(filePath);
            console.log(`File ${file} accessibility:`, {
                path: filePath,
                isAccessible,
                timestamp: new Date().toISOString()
            });
        }
        
        // Check background images
        const backgroundFiles = await fs.promises.readdir(backgroundsDir);
        for (const file of backgroundFiles) {
            const filePath = path.join(backgroundsDir, file);
            const isAccessible = await verifyFileAccess(filePath);
            console.log(`Background file ${file} accessibility:`, {
                path: filePath,
                isAccessible,
                timestamp: new Date().toISOString()
            });
        }
        
        return true;
    } catch (error) {
        console.error('Filesystem health check failed:', error);
        return false;
    }
}

// Start periodic filesystem health checks
setInterval(async () => {
    const isHealthy = await checkFilesystemHealth();
    if (!isHealthy) {
        console.error('Filesystem health check failed, clearing cache');
        fileStatsCache.clear();
    }
}, FILESYSTEM_CHECK_INTERVAL);

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

// Custom static file middleware with detailed logging and caching
const staticMiddleware = async (req, res, next) => {
    const publicDir = path.join(__dirname, 'public');
    const requestedPath = req.path;
    const fullPath = path.join(publicDir, requestedPath);
    
    try {
        const isAccessible = await verifyFileAccess(fullPath);
        console.log('Static file request:', {
            requestedPath,
            fullPath,
            exists: fs.existsSync(fullPath),
            isAccessible,
            cacheHit: fileStatsCache.has(fullPath),
            timestamp: new Date().toISOString()
        });

        if (isAccessible) {
            // File exists and is accessible, let express.static handle it
            return express.static(publicDir, {
                maxAge: '1h',
                etag: true,
                lastModified: true
            })(req, res, next);
        }
        
        // File doesn't exist or isn't accessible
        console.log('File not found or not accessible:', {
            requestedPath,
            fullPath,
            error: 'File not found or not accessible',
            timestamp: new Date().toISOString()
        });
        next();
    } catch (error) {
        console.error('Error in static middleware:', error);
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