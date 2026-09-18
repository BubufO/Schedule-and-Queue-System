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

## Step 3: Setup the frontend

1. Navigate to the frontend folder:
```bash
   cd frontend
```
2. Install dependencies:
```bash
   npm install
```
3. Start the app:
```bash
   npx expo start
```