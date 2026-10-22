# Project Setup Guide for Schedule and Queue System

## Requirements
* Node.js installed
* Python installed

## Step 1: Clone this repo

```bash
git clone https://github.com/BubufO/Schedule-and-Queue-System.git
cd Schedule-and-Queue-System
```

## Step 2: Setup the backend

1. Navigate to the backend folder:
```bash
   cd backend
```
2. Create and activate a virtual environment:
```bash
   python3 -m venv .venv
   source .venv/bin/activate
```
3. Install Python dependencies:
```bash
   pip install -r requirements.txt
```
4. Run the backend:
```bash
   uv run fastapi dev
```
   The API runs at http://localhost:8000. Interactive API docs are at http://localhost:8000/docs.
   Data is kept in memory, so restarting the server resets it to the seed data.

## Step 3: Setup the frontend

1. Navigate to the frontend folder:
```bash
   cd frontend
```
2. Install dependencies:
```bash
   npm install
```
3. Start the app (start the backend first; the app shows a warning if it can't reach it):
```bash
   npx expo start
```
4. Testing on a phone: "localhost" on the phone means the phone itself, so point the app at your
   computer instead. Create `frontend/.env.local` with your computer's network address:
```bash
   EXPO_PUBLIC_API_URL=http://192.168.1.25:8000
```
   and start the backend with `uv run fastapi dev --host 0.0.0.0` so other devices can reach it.