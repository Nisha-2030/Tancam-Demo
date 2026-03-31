from fastapi import APIRouter

from app.schemas.common import ApiResponse
from app.schemas.news import (
    FetchNewsRequest,
    FetchNewsResponse,
    FilterNewsRequest,
    FilterNewsResponse,
    RunPipelineRequest,
    RunPipelineResponse,
    TrustScoreRequest,
    TrustScoreResponse,
)
from app.services.news_service import news_service
from app.services.trust_service import trust_service

router = APIRouter()


@router.post("/fetch", response_model=ApiResponse)
async def fetch_news(payload: FetchNewsRequest) -> ApiResponse:
    items = await news_service.fetch_news(payload)
    return ApiResponse(
        data=FetchNewsResponse(items=items, total=len(items)).model_dump(),
        message="News fetched successfully",
    )


@router.post("/pipeline", response_model=ApiResponse)
async def run_news_pipeline(payload: RunPipelineRequest) -> ApiResponse:
    result = await news_service.run_pipeline(payload)
    return ApiResponse(
        data=RunPipelineResponse(**result.model_dump()).model_dump(),
        message="News pipeline completed successfully",
    )


@router.post("/filter", response_model=ApiResponse)
async def filter_news(payload: FilterNewsRequest) -> ApiResponse:
    result = await news_service.filter_news(payload)
    return ApiResponse(
        data=result.model_dump(),
        message="News filtered successfully",
    )


@router.post("/trust-score", response_model=ApiResponse)
async def trust_score_news(payload: TrustScoreRequest) -> ApiResponse:
    scored_items = await trust_service.assign_scores(payload.items)
    return ApiResponse(
        data=TrustScoreResponse(items=scored_items, total=len(scored_items)).model_dump(),
        message="Trust scores assigned successfully",
    )


@router.post("/trust-score/refresh", response_model=ApiResponse)
async def refresh_trust_score_news(payload: TrustScoreRequest) -> ApiResponse:
    scored_items = await trust_service.assign_scores(payload.items)
    return ApiResponse(
        data=TrustScoreResponse(items=scored_items, total=len(scored_items)).model_dump(),
        message="Trust scores dynamically refreshed",
    )
