from fastapi import APIRouter

from app.api.routes.content import router as content_router
from app.api.routes.news import router as news_router

api_router = APIRouter()
api_router.include_router(news_router, prefix="/news", tags=["News"])
api_router.include_router(content_router, prefix="/content", tags=["Content"])
