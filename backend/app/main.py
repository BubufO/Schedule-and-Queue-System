from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import services

app = FastAPI(
    title="QueueSmart API",
    description="Service and queue management for QueueSmart. Data is held in memory.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(services.router)


@app.get("/")
async def root():
    return {"message": "QueueSmart API is running. See /docs for the endpoints."}
