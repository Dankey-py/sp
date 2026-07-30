# Welcome to React Router!

A modern, production-ready template for building full-stack React applications using React Router.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Create the server environment file (never commit the real API key):

```bash
cp .env.example .env
```

Set the domestic-platform `MOONSHOT_API_KEY` in `.env`, then start the
development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

### Kimi chat API

This project uses the Kimi domestic platform through the OpenAI-compatible
endpoint `https://api.moonshot.cn/v1`. Create the API Key at
`https://platform.kimi.com`; international-platform keys are not compatible.

Send one message:

```bash
curl -X POST http://localhost:5173/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"你好，请介绍一下你自己"}'
```

For a multi-turn conversation, send the complete history on every request because
Kimi's Chat Completions API is stateless:

```json
{
  "messages": [
    { "role": "system", "content": "You are a study planning assistant." },
    { "role": "user", "content": "Help me plan two hours of revision." },
    { "role": "assistant", "content": "Which subject are you revising?" },
    { "role": "user", "content": "Mathematics." }
  ]
}
```

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.
