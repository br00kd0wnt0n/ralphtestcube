const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Get port from environment variable or use 3000 as fallback
const PORT = process.env.PORT || 3000;

// Add detailed logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    console.log(`[${timestamp}] Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`[${timestamp}] Environment:`, process.env.NODE_ENV);
    console.log(`[${timestamp}] Working directory:`, process.cwd());
    next();
});

// Log startup information
const publicDir = path.join(__dirname, 'public');
console.log('Server startup information:');
console.log('- Current working directory:', process.cwd());
console.log('- Server directory:', __dirname);
console.log('- Public directory:', publicDir);
console.log('- Environment:', process.env.NODE_ENV || 'development');
console.log('- Port:', PORT);

// Verify public directory exists
if (!fs.existsSync(publicDir)) {
    console.error('ERROR: Public directory does not exist at:', publicDir);
    process.exit(1);
}

// List files in public directory
try {
    const files = fs.readdirSync(publicDir);
    console.log('- Files in public directory:', files);
} catch (error) {
    console.error('ERROR: Could not read public directory:', error);
    process.exit(1);
}

// Serve static files from the public directory with explicit options
app.use(express.static(publicDir, {
    dotfiles: 'ignore',
    etag: true,
    index: false,
    maxAge: '1h',
    fallthrough: false // This will make express.static throw 404s instead of falling through
}));

// Handle favicon requests
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Serve index.html for all routes
app.get('*', (req, res, next) => {
    const indexPath = path.join(publicDir, 'index.html');
    console.log(`[${new Date().toISOString()}] Attempting to serve index.html from:`, indexPath);
    
    // Verify index.html exists
    if (!fs.existsSync(indexPath)) {
        console.error('ERROR: index.html not found at:', indexPath);
        return res.status(500).send('Server configuration error: index.html not found');
    }

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            next(err);
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).send('Internal Server Error');
});

// Start server with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
    const host = server.address();
    console.log(`Server is running on ${host.address}:${host.port}`);
    console.log(`Server URL: http://${host.address}:${host.port}`);
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
    }
    process.exit(1);
});

// Handle process termination
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
}); 