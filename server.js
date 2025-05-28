const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Get port from environment variable or use 3002 as fallback
const PORT = process.env.PORT || 3002;

// Cache for file stats to reduce filesystem operations
const fileStatsCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache TTL

// Function to get file stats with caching
function getFileStats(filePath) {
    const now = Date.now();
    const cached = fileStatsCache.get(filePath);
    
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
        return cached.stats;
    }
    
    try {
        const stats = fs.statSync(filePath);
        fileStatsCache.set(filePath, {
            stats,
            timestamp: now
        });
        return stats;
    } catch (error) {
        console.error('Error getting file stats:', {
            filePath,
            error: error.message
        });
        return null;
    }
}

// Function to verify file accessibility
function verifyFileAccess(filePath) {
    try {
        const stats = getFileStats(filePath);
        if (!stats) return false;
        
        // Check if file is readable
        fs.accessSync(filePath, fs.constants.R_OK);
        return true;
    } catch (error) {
        console.error('File access error:', {
            filePath,
            error: error.message
        });
        return false;
    }
}

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
app.get('/health', (req, res) => {
    try {
        const publicDir = path.join(__dirname, 'public');
        const indexPath = path.join(publicDir, 'index.html');
        
        console.log('Health check - Checking paths:');
        console.log('Public directory:', publicDir);
        console.log('Index path:', indexPath);
        
        // List files in public directory with stats and accessibility
        const publicFiles = fs.readdirSync(publicDir).map(file => {
            const filePath = path.join(publicDir, file);
            const stats = getFileStats(filePath);
            const isAccessible = verifyFileAccess(filePath);
            return {
                name: file,
                size: stats?.size,
                permissions: stats?.mode.toString(8),
                isDirectory: stats?.isDirectory(),
                isAccessible,
                lastChecked: new Date().toISOString()
            };
        });
        
        const backgroundFiles = fs.readdirSync(path.join(publicDir, 'backgrounds')).map(file => {
            const filePath = path.join(publicDir, 'backgrounds', file);
            const stats = getFileStats(filePath);
            const isAccessible = verifyFileAccess(filePath);
            return {
                name: file,
                size: stats?.size,
                permissions: stats?.mode.toString(8),
                isAccessible,
                lastChecked: new Date().toISOString()
            };
        });
        
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
const staticMiddleware = (req, res, next) => {
    const publicDir = path.join(__dirname, 'public');
    const requestedPath = req.path;
    const fullPath = path.join(publicDir, requestedPath);
    
    console.log('Static file request:', {
        requestedPath,
        fullPath,
        exists: fs.existsSync(fullPath),
        isAccessible: verifyFileAccess(fullPath),
        cacheHit: fileStatsCache.has(fullPath),
        timestamp: new Date().toISOString()
    });

    // Check if file exists and is accessible
    if (verifyFileAccess(fullPath)) {
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
};

app.use(staticMiddleware);

// Handle all other routes by serving index.html
app.get('*', (req, res, next) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    const isAccessible = verifyFileAccess(indexPath);
    
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
});

// Start the server with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log('Current directory:', process.cwd());
    console.log('Server directory:', __dirname);
    console.log('Public directory:', path.join(__dirname, 'public'));
    console.log('Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        RAILWAY_WORKSPACE_DIR: process.env.RAILWAY_WORKSPACE_DIR
    });
    
    // List files in public directory on startup with accessibility check
    try {
        const publicFiles = fs.readdirSync(path.join(__dirname, 'public')).map(file => {
            const filePath = path.join(__dirname, 'public', file);
            const stats = getFileStats(filePath);
            const isAccessible = verifyFileAccess(filePath);
            return {
                name: file,
                size: stats?.size,
                permissions: stats?.mode.toString(8),
                isDirectory: stats?.isDirectory(),
                isAccessible,
                lastChecked: new Date().toISOString()
            };
        });
        
        const backgroundFiles = fs.readdirSync(path.join(__dirname, 'public', 'backgrounds')).map(file => {
            const filePath = path.join(__dirname, 'public', 'backgrounds', file);
            const stats = getFileStats(filePath);
            const isAccessible = verifyFileAccess(filePath);
            return {
                name: file,
                size: stats?.size,
                permissions: stats?.mode.toString(8),
                isAccessible,
                lastChecked: new Date().toISOString()
            };
        });
        
        console.log('Available files:', {
            public: publicFiles,
            backgrounds: backgroundFiles,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error listing files:', error);
    }
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