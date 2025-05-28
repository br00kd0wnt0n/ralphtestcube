# Ralph Cube Navigation Prototype

An interactive 3D cube navigation interface with parallax backgrounds, built as a prototype for an immersive web experience.

## Features

- Interactive 3D cube navigation
- Smooth auto-rotation with user interaction
- Parallax background effects
- Responsive design
- Simple Express server with optimized static file serving

## Quick Start

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3002 in your browser

## Development

- `npm run dev` - Start development server with hot reload
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Project Structure

```
.
├── public/             # Static files
│   ├── index.html     # Main application
│   ├── backgrounds/   # Background images
│   └── assets/        # Other static assets
├── server.js          # Express server
├── package.json       # Project configuration
└── railway.toml       # Railway deployment config
```

## Environment Variables

- `PORT` - Server port (default: 3002)
- `NODE_ENV` - Environment (development/production)

## Deployment

The application is configured for deployment on Railway. The deployment process is automated through the `railway.toml` configuration.

## Prototype Notes

- This is a prototype version with basic functionality
- The cube features auto-rotation that pauses on user interaction
- Background images are served with optimized caching
- Server includes basic security headers and error handling

## Known Limitations

- Currently optimized for modern browsers
- Large background images may affect initial load time
- Mobile touch interactions are basic

## License

Private - All rights reserved 