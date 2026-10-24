from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.errors import register_error_handlers
from app.routers import auth, notifications, profile, queues, services

app = FastAPI(
    title="QueueSmart API",
    description="Authentication, service and queue management for QueueSmart. Data is held in memory.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(services.router)
app.include_router(queues.router)
app.include_router(notifications.router)


@app.get("/")
async def root():
    return {"message": "QueueSmart API is running. See /docs for the endpoints."}
